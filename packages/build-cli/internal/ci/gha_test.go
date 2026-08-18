package ci_test

import (
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"strings"
	"testing"

	"github.com/inshinrei/yorozu/packages/build-cli/internal/ci"
)

func TestWriteOutputSingleLine(t *testing.T) {
	p := filepath.Join(t.TempDir(), "out")
	os.WriteFile(p, nil, 0o644)
	t.Setenv("GITHUB_OUTPUT", p)
	if err := ci.WriteOutput("packages", "a,b"); err != nil {
		t.Fatal(err)
	}
	b, _ := os.ReadFile(p)
	if string(b) != "packages=a,b\n" && string(b) != "packages=a,b"+os.Getenv("unused") {
		if string(b) != "packages=a,b"+fmt.Sprintln() {
			t.Fatalf("%q", b)
		}
	}
}

func TestWriteOutputRequiresEnv(t *testing.T) {
	t.Setenv("GITHUB_OUTPUT", "")
	os.Unsetenv("GITHUB_OUTPUT")
	if err := ci.WriteOutput("x", "y"); err == nil || !strings.Contains(err.Error(), "GITHUB_OUTPUT is not set") {
		t.Fatalf("err=%v", err)
	}
}

func TestWriteOutputMultiline(t *testing.T) {
	p := filepath.Join(t.TempDir(), "out")
	os.WriteFile(p, nil, 0o644)
	t.Setenv("GITHUB_OUTPUT", p)
	if err := ci.WriteOutput("notes", "line one\nline two"); err != nil {
		t.Fatal(err)
	}
	b, _ := os.ReadFile(p)
	written := string(b)
	lines := strings.Split(written, "\n")
	if len(lines) == 0 || !regexp.MustCompile(`^notes<<---[0-9a-f-]{36}---$`).MatchString(lines[0]) {
		t.Fatalf("header=%q written=%q", first(lines), written)
	}
	delim := strings.TrimPrefix(lines[0], "notes<<")
	want := []string{"notes<<" + delim, "line one", "line two", delim, ""}
	if !reflect.DeepEqual(lines, want) {
		t.Fatalf("lines=%q want=%q", lines, want)
	}
	if !strings.HasSuffix(written, "\n"+delim+"\n") {
		t.Fatalf("missing closing delim newline: %q", written)
	}
	if strings.Contains(written, "two"+delim) {
		t.Fatalf("closing delim glued to value: %q", written)
	}
}

func TestRunning(t *testing.T) {
	t.Setenv("GITHUB_ACTIONS", "")
	os.Unsetenv("GITHUB_ACTIONS")
	if ci.Running() {
		t.Fatal("expected false when GITHUB_ACTIONS is unset")
	}
	t.Setenv("GITHUB_ACTIONS", "true")
	if !ci.Running() {
		t.Fatal("expected true when GITHUB_ACTIONS is set")
	}
}

func TestInput(t *testing.T) {
	t.Setenv("INPUT_FOO_BAR", "  val  ")
	if got := ci.Input("foo bar"); got != "val" {
		t.Fatalf("got %q", got)
	}
	if got := ci.Input("missing"); got != "" {
		t.Fatalf("missing=%q", got)
	}
}

func first(lines []string) string {
	if len(lines) == 0 {
		return ""
	}
	return lines[0]
}
