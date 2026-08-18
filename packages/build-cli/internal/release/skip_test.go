package release

import (
	"testing"

	"github.com/inshinrei/yorozu/packages/build-cli/internal/git"
)

func TestShouldSkipAuto(t *testing.T) {
	if !ShouldSkipAuto("auto", "v0.1.0", nil) {
		t.Fatal("expected skip when auto + prev tag + no commits")
	}
	if ShouldSkipAuto("auto", "v0.1.0", []git.Commit{{Hash: "abc"}}) {
		t.Fatal("did not expect skip when commits exist")
	}
	if ShouldSkipAuto("auto", "", nil) {
		t.Fatal("did not expect skip on first release")
	}
	for _, kind := range []string{"patch", "minor", "major"} {
		if ShouldSkipAuto(kind, "v0.1.0", nil) {
			t.Fatalf("did not expect skip for kind %s", kind)
		}
	}
}
