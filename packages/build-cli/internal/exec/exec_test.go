package exec_test

import (
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/inshinrei/yorozu/packages/build-cli/internal/exec"
)

func TestRunThrowOnError(t *testing.T) {
	_, err := exec.Run([]string{"false"}, exec.Options{ThrowOnError: true})
	var execErr *exec.Error
	if !errors.As(err, &execErr) {
		t.Fatalf("err=%v", err)
	}
	if execErr.Result.ExitCode == 0 {
		t.Fatalf("exit %d", execErr.Result.ExitCode)
	}
}

func TestRunInheritIOLogsCommand(t *testing.T) {
	dir := t.TempDir()
	got := captureStdout(t, func() {
		_, err := exec.Run([]string{"true"}, exec.Options{InheritIO: true, Dir: dir})
		if err != nil {
			t.Fatal(err)
		}
	})
	rel, err := filepath.Rel(mustWd(t), dir)
	if err != nil {
		t.Fatal(err)
	}
	want := "\x1b[;3m" + rel + "\x1b[;23m \x1b[;34m$\x1b[;0m true\n"
	if got != want {
		t.Fatalf("log=%q want=%q", got, want)
	}

	sameDir := mustWd(t)
	got = captureStdout(t, func() {
		_, err := exec.Run([]string{"true"}, exec.Options{InheritIO: true, Dir: sameDir})
		if err != nil {
			t.Fatal(err)
		}
	})
	if got != "\x1b[;34m$\x1b[;0m true\n" {
		t.Fatalf("same-cwd log=%q", got)
	}

	got = captureStdout(t, func() {
		_, err := exec.Run([]string{"true"}, exec.Options{InheritIO: true, Quiet: true})
		if err != nil {
			t.Fatal(err)
		}
	})
	if strings.Contains(got, "$") {
		t.Fatalf("quiet log=%q", got)
	}
}

func mustWd(t *testing.T) string {
	t.Helper()
	wd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	return wd
}

func captureStdout(t *testing.T, fn func()) string {
	t.Helper()
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	old := os.Stdout
	os.Stdout = w
	defer func() { os.Stdout = old }()
	fn()
	w.Close()
	out, err := io.ReadAll(r)
	if err != nil {
		t.Fatal(err)
	}
	return string(out)
}
