package workspace

type Yorozu struct {
	JSR            string         `json:"jsr,omitempty" yaml:"jsr,omitempty"`
	NPM            string         `json:"npm,omitempty" yaml:"npm,omitempty"`
	KeepScripts    []string       `json:"keepScripts,omitempty" yaml:"keepScripts,omitempty"`
	DistOnlyFields map[string]any `json:"distOnlyFields,omitempty" yaml:"distOnlyFields,omitempty"`
	OwnVersioning  bool           `json:"ownVersioning,omitempty" yaml:"ownVersioning,omitempty"`
	Private        bool           `json:"private,omitempty" yaml:"private,omitempty"`
	Standalone     bool           `json:"standalone,omitempty" yaml:"standalone,omitempty"`
}

type PackageJSON struct {
	Name                 string                       `json:"name,omitempty" yaml:"name,omitempty"`
	Type                 string                       `json:"type,omitempty" yaml:"type,omitempty"`
	Version              string                       `json:"version,omitempty" yaml:"version,omitempty"`
	Private              bool                         `json:"private,omitempty" yaml:"private,omitempty"`
	Description          string                       `json:"description,omitempty" yaml:"description,omitempty"`
	License              string                       `json:"license,omitempty" yaml:"license,omitempty"`
	Homepage             string                       `json:"homepage,omitempty" yaml:"homepage,omitempty"`
	Workspaces           []string                     `json:"workspaces,omitempty" yaml:"workspaces,omitempty"`
	Catalogs             map[string]map[string]string `json:"catalogs,omitempty" yaml:"catalogs,omitempty"`
	Scripts              map[string]string            `json:"scripts,omitempty" yaml:"scripts,omitempty"`
	Dependencies         map[string]string            `json:"dependencies,omitempty" yaml:"dependencies,omitempty"`
	DevDependencies      map[string]string            `json:"devDependencies,omitempty" yaml:"devDependencies,omitempty"`
	PeerDependencies     map[string]string            `json:"peerDependencies,omitempty" yaml:"peerDependencies,omitempty"`
	OptionalDependencies map[string]string            `json:"optionalDependencies,omitempty" yaml:"optionalDependencies,omitempty"`
	Yorozu               *Yorozu                      `json:"yorozu,omitempty" yaml:"yorozu,omitempty"`
}

type Package struct {
	Path            string
	PackageJSONPath string
	Root            bool
	JSON            PackageJSON
}
