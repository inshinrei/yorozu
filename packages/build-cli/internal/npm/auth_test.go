package npm_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/inshinrei/yorozu/packages/build-cli/internal/npm"
)

func TestNormalizeAuthTokenMissingOrBlank(t *testing.T) {
	if got := npm.NormalizeAuthToken(""); got != "" {
		t.Fatalf("empty=%q", got)
	}
	if got := npm.NormalizeAuthToken("   "); got != "" {
		t.Fatalf("blank=%q", got)
	}
}

func TestNormalizeAuthTokenTrimsNonEmpty(t *testing.T) {
	if got := npm.NormalizeAuthToken("secret"); got != "secret" {
		t.Fatalf("got %q", got)
	}
	if got := npm.NormalizeAuthToken("  secret  "); got != "secret" {
		t.Fatalf("got %q", got)
	}
}

func TestFormatAuthRcWritesRegistryAuthLine(t *testing.T) {
	got := npm.FormatAuthRc("https://registry.npmjs.org", "secret-token")
	want := "//registry.npmjs.org/:_authToken=secret-token\n"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestPrepareAuthNoFileForMissingOrBlankToken(t *testing.T) {
	for _, token := range []string{"", "   "} {
		auth, err := npm.PrepareAuth(token, "https://registry.npmjs.org")
		if err != nil {
			t.Fatal(err)
		}
		if len(auth.ExtraArgs) != 0 {
			t.Fatalf("args=%v", auth.ExtraArgs)
		}
		if len(auth.ExtraEnv) != 0 {
			t.Fatalf("env=%v", auth.ExtraEnv)
		}
		for _, arg := range auth.ExtraArgs {
			if arg == "--global" {
				t.Fatal("must never use --global")
			}
		}
		if err := auth.Cleanup(); err != nil {
			t.Fatal(err)
		}
	}
}

func TestPrepareAuthWritesTemporaryUserconfigNeverGlobal(t *testing.T) {
	auth, err := npm.PrepareAuth("secret-token", "https://registry.npmjs.org")
	if err != nil {
		t.Fatal(err)
	}
	if len(auth.ExtraArgs) != 2 || auth.ExtraArgs[0] != "--userconfig" {
		t.Fatalf("args=%v", auth.ExtraArgs)
	}
	npmrcPath := auth.ExtraArgs[1]
	if !strings.Contains(npmrcPath, "yorozu-npm-auth-") {
		t.Fatalf("temp dir prefix missing: %s", npmrcPath)
	}
	if filepath.Base(npmrcPath) != ".npmrc" {
		t.Fatalf("npmrc=%s", npmrcPath)
	}

	defer func() {
		if err := auth.Cleanup(); err != nil {
			t.Fatal(err)
		}
	}()

	for _, arg := range auth.ExtraArgs {
		if arg == "--global" || arg == "config" {
			t.Fatalf("forbidden arg %q in %v", arg, auth.ExtraArgs)
		}
	}
	if auth.ExtraEnv["NPM_TOKEN"] != "secret-token" || auth.ExtraEnv["NODE_AUTH_TOKEN"] != "secret-token" {
		t.Fatalf("env=%v", auth.ExtraEnv)
	}
	if len(auth.ExtraEnv) != 2 {
		t.Fatalf("env=%v", auth.ExtraEnv)
	}
	body, err := os.ReadFile(npmrcPath)
	if err != nil {
		t.Fatal(err)
	}
	if string(body) != "//registry.npmjs.org/:_authToken=secret-token\n" {
		t.Fatalf("npmrc=%q", body)
	}
	info, err := os.Stat(npmrcPath)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("mode=%o", info.Mode().Perm())
	}

	if err := auth.Cleanup(); err != nil {
		t.Fatal(err)
	}
	auth.Cleanup = func() error { return nil }
	if _, err := os.ReadFile(npmrcPath); err == nil {
		t.Fatal("expected npmrc to be removed")
	}
}
