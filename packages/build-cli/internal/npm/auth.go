package npm

import (
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

type Auth struct {
	ExtraArgs []string
	ExtraEnv  map[string]string
	Cleanup   func() error
}

func NormalizeAuthToken(token string) string {
	return strings.TrimSpace(token)
}

func FormatAuthRc(registryURL, token string) string {
	base, err := url.Parse(registryURL)
	var key string
	if err != nil {
		key = registryURL
		if !strings.HasSuffix(key, "/") {
			key += "/"
		}
		key += ":_authToken"
	} else {
		key = base.ResolveReference(&url.URL{Path: ":_authToken"}).String()
	}
	if strings.HasPrefix(key, "https://") {
		key = "//" + strings.TrimPrefix(key, "https://")
	}
	return key + "=" + token + "\n"
}

func PrepareAuth(token, registryURL string) (Auth, error) {
	token = NormalizeAuthToken(token)
	if token == "" {
		return Auth{
			ExtraArgs: []string{},
			ExtraEnv:  map[string]string{},
			Cleanup:   func() error { return nil },
		}, nil
	}

	dir, err := os.MkdirTemp("", "yorozu-npm-auth-")
	if err != nil {
		return Auth{}, err
	}
	npmrc := filepath.Join(dir, ".npmrc")
	if err := os.WriteFile(npmrc, []byte(FormatAuthRc(registryURL, token)), 0o600); err != nil {
		os.RemoveAll(dir)
		return Auth{}, err
	}
	if err := os.Chmod(npmrc, 0o600); err != nil {
		os.RemoveAll(dir)
		return Auth{}, err
	}
	return Auth{
		ExtraArgs: []string{"--userconfig", npmrc},
		ExtraEnv: map[string]string{
			"NPM_TOKEN":       token,
			"NODE_AUTH_TOKEN": token,
		},
		Cleanup: func() error {
			return os.RemoveAll(dir)
		},
	}, nil
}
