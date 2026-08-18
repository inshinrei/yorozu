package workspace_test

import (
	"reflect"
	"strings"
	"testing"

	"github.com/inshinrei/yorozu/packages/build-cli/internal/workspace"
)

func TestDeterminePublishOrder(t *testing.T) {
	got, err := workspace.DeterminePublishOrder(map[string][]string{"app": {"lib"}, "lib": {"core"}, "core": {}})
	if err != nil || !reflect.DeepEqual(got, []string{"core", "lib", "app"}) {
		t.Fatalf("%v %v", got, err)
	}
	got, err = workspace.DeterminePublishOrder(map[string][]string{
		"app": {"left", "right"}, "left": {"shared"}, "right": {"shared"}, "shared": {},
	})
	if err != nil || !reflect.DeepEqual(got, []string{"shared", "left", "right", "app"}) {
		t.Fatalf("%v %v", got, err)
	}
	got, err = workspace.DeterminePublishOrder(map[string][]string{"app": {"lib", "lodash"}, "lib": {"typescript"}})
	if err != nil || !reflect.DeepEqual(got, []string{"lib", "app"}) {
		t.Fatalf("%v %v", got, err)
	}
	got, err = workspace.DeterminePublishOrder(map[string][]string{"a": {}, "b": {}, "c": {}})
	if err != nil || !reflect.DeepEqual(got, []string{"a", "b", "c"}) {
		t.Fatalf("%v %v", got, err)
	}
	_, err = workspace.DeterminePublishOrder(map[string][]string{"a": {"b"}, "b": {"c"}, "c": {"a"}})
	if err == nil || !strings.Contains(err.Error(), "Circular dependency detected") {
		t.Fatalf("err=%v", err)
	}
}

func TestSortByPublishOrder(t *testing.T) {
	ordered, err := workspace.SortByPublishOrder([]workspace.Package{
		pkgDeps("app", map[string]string{"left": "workspace:^", "right": "workspace:^"}, nil),
		pkgDeps("left", map[string]string{"shared": "workspace:^"}, nil),
		pkgDeps("right", nil, map[string]string{"shared": "workspace:^"}),
		pkgDeps("shared", nil, nil),
	})
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(namesOf(ordered), []string{"shared", "left", "right", "app"}) {
		t.Fatalf("%v", namesOf(ordered))
	}

	ordered, err = workspace.SortByPublishOrder([]workspace.Package{
		pkgDeps("app", map[string]string{"lib": "workspace:^", "lodash": "^4.17.21"}, nil),
		pkgDeps("lib", map[string]string{"typescript": "catalog:"}, nil),
	})
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(namesOf(ordered), []string{"lib", "app"}) {
		t.Fatalf("%v", namesOf(ordered))
	}
}

func pkgDeps(name string, deps, peers map[string]string) workspace.Package {
	return workspace.Package{
		JSON: workspace.PackageJSON{
			Name:             name,
			Version:          "1.0.0",
			Dependencies:     deps,
			PeerDependencies: peers,
		},
	}
}
