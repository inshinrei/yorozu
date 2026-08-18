package git_test

import (
	"reflect"
	"testing"

	"github.com/inshinrei/yorozu/packages/build-cli/internal/git"
)

func TestParseConventional(t *testing.T) {
	t.Run("parses feat: without a scope", func(t *testing.T) {
		got := git.ParseConventional("feat: add publish order")
		want := &git.Conventional{Type: "feat", Breaking: false, Subject: "add publish order"}
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("got %#v want %#v", got, want)
		}
	})

	t.Run("parses feat(scope):", func(t *testing.T) {
		got := git.ParseConventional("feat(build): add publish order")
		want := &git.Conventional{Type: "feat", Scope: "build", Breaking: false, Subject: "add publish order"}
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("got %#v want %#v", got, want)
		}
	})

	t.Run("parses feat!: as breaking", func(t *testing.T) {
		got := git.ParseConventional("feat!: drop node 18")
		want := &git.Conventional{Type: "feat", Breaking: true, Subject: "drop node 18"}
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("got %#v want %#v", got, want)
		}
	})

	t.Run("parses feat(scope)!: as breaking with a scope", func(t *testing.T) {
		got := git.ParseConventional("feat(api)!: rename hook context")
		want := &git.Conventional{Type: "feat", Scope: "api", Breaking: true, Subject: "rename hook context"}
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("got %#v want %#v", got, want)
		}
	})

	t.Run("marks a commit breaking when the body has a BREAKING CHANGE footer", func(t *testing.T) {
		got := git.ParseConventional("feat: change the release tag schema\n\nBREAKING CHANGE: tags are now vX.Y.Z")
		want := &git.Conventional{Type: "feat", Breaking: true, Subject: "change the release tag schema"}
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("got %#v want %#v", got, want)
		}
	})

	t.Run("marks a commit breaking when the footer uses BREAKING-CHANGE", func(t *testing.T) {
		got := git.ParseConventional("fix: align versions\n\nBREAKING-CHANGE: dependents must bump")
		want := &git.Conventional{Type: "fix", Breaking: true, Subject: "align versions"}
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("got %#v want %#v", got, want)
		}
	})

	t.Run("returns null for a non-conventional subject", func(t *testing.T) {
		if git.ParseConventional("just a regular commit") != nil {
			t.Fatalf("got %#v want nil", git.ParseConventional("just a regular commit"))
		}
	})
}
