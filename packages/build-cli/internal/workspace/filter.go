package workspace

func FilterForPublish(pkgs []Package, registry string) []Package {
	other := "jsr"
	if registry == "jsr" {
		other = "npm"
	}
	var out []Package
	for _, pkg := range pkgs {
		if pkg.Root {
			continue
		}
		cfg := pkg.JSON.Yorozu
		if cfg == nil {
			out = append(out, pkg)
			continue
		}
		if cfg.Private {
			continue
		}
		if registryValue(cfg, registry) == "skip" {
			continue
		}
		if registryValue(cfg, other) == "only" {
			continue
		}
		out = append(out, pkg)
	}
	return out
}

func registryValue(cfg *Yorozu, registry string) string {
	if registry == "npm" {
		return cfg.NPM
	}
	return cfg.JSR
}
