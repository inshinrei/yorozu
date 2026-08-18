package npm

import (
	"io"
	"net/http"
	"strings"
	"time"
)

const (
	UserAgent       = "@yorozu/build"
	DefaultRegistry = "https://registry.npmjs.org"
	RequestTimeout  = 30 * time.Second
)

func CheckVersion(registry, name, version string) (bool, error) {
	if registry == "" {
		registry = DefaultRegistry
	}
	registry = strings.TrimSuffix(registry, "/")
	req, err := http.NewRequest(http.MethodGet, registry+"/"+name+"/"+version, nil)
	if err != nil {
		return false, err
	}
	req.Header.Set("User-Agent", UserAgent)
	client := &http.Client{Timeout: RequestTimeout}
	res, err := client.Do(req)
	if err != nil {
		return false, err
	}
	defer res.Body.Close()
	_, _ = io.Copy(io.Discard, res.Body)
	return res.StatusCode == http.StatusOK, nil
}
