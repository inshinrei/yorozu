package cr

import (
	"reflect"
	"sort"
	"testing"

	"github.com/inshinrei/yorozu/packages/build-cli/internal/workspace"
)

func pkg(json workspace.PackageJSON) workspace.Package {
	return workspace.Package{
		Path:            "/tmp/" + json.Name,
		PackageJSONPath: "/tmp/" + json.Name + "/package.json",
		JSON:            json,
	}
}

func names(pkgs []workspace.Package) []string {
	out := make([]string, 0, len(pkgs))
	for _, p := range pkgs {
		out = append(out, p.JSON.Name)
	}
	sort.Strings(out)
	return out
}

func TestSelectChangedNpm(t *testing.T) {
	utils := pkg(workspace.PackageJSON{Name: "@yorozu/utils", Version: "0.1.0"})
	io := pkg(workspace.PackageJSON{
		Name:         "@yorozu/io",
		Version:      "0.1.0",
		Dependencies: map[string]string{"@yorozu/utils": "workspace:^"},
	})
	secret := pkg(workspace.PackageJSON{
		Name:    "@yorozu/secret",
		Version: "0.1.0",
		Yorozu:  &workspace.Yorozu{Private: true},
	})
	npmSkip := pkg(workspace.PackageJSON{
		Name:         "@yorozu/docs-site",
		Version:      "0.1.0",
		Yorozu:       &workspace.Yorozu{NPM: "skip"},
		Dependencies: map[string]string{"@yorozu/utils": "workspace:^"},
	})
	jsrOnly := pkg(workspace.PackageJSON{
		Name:    "@yorozu/types",
		Version: "0.1.0",
		Yorozu:  &workspace.Yorozu{JSR: "only"},
	})
	publishable := []workspace.Package{utils, io}

	got := names(SelectChangedNpm([]workspace.Package{utils}, []workspace.Package{utils}))
	if !reflect.DeepEqual(got, []string{"@yorozu/utils"}) {
		t.Fatalf("keep publishable: %v", got)
	}

	if got := SelectChangedNpm(publishable, []workspace.Package{secret, npmSkip, jsrOnly}); len(got) != 0 {
		t.Fatalf("expected empty, got %v", names(got))
	}

	got = names(SelectChangedNpm(publishable, []workspace.Package{utils}))
	if !reflect.DeepEqual(got, []string{"@yorozu/io", "@yorozu/utils"}) {
		t.Fatalf("dependents: %v", got)
	}

	got = names(SelectChangedNpm([]workspace.Package{utils, io}, []workspace.Package{utils, npmSkip}))
	if !reflect.DeepEqual(got, []string{"@yorozu/io", "@yorozu/utils"}) {
		t.Fatalf("skipped dependent: %v", got)
	}
}
