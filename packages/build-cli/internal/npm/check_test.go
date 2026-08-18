package npm_test

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/inshinrei/yorozu/packages/build-cli/internal/npm"
)

func TestCheckVersionTrueIffHTTP200(t *testing.T) {
	var gotUA, gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotUA = r.Header.Get("User-Agent")
		gotPath = r.URL.Path
		switch r.URL.Path {
		case "/foo/1.0.0", "/@scope/pkg/2.0.0":
			w.WriteHeader(http.StatusOK)
			_, _ = io.WriteString(w, `{"ok":true}`)
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer srv.Close()

	ok, err := npm.CheckVersion(srv.URL, "foo", "1.0.0")
	if err != nil || !ok {
		t.Fatalf("200: ok=%v err=%v", ok, err)
	}
	if gotUA != "@yorozu/build" {
		t.Fatalf("ua=%q", gotUA)
	}
	if gotPath != "/foo/1.0.0" {
		t.Fatalf("path=%q", gotPath)
	}

	ok, err = npm.CheckVersion(srv.URL+"/", "foo", "9.9.9")
	if err != nil || ok {
		t.Fatalf("404: ok=%v err=%v", ok, err)
	}

	ok, err = npm.CheckVersion(srv.URL, "@scope/pkg", "2.0.0")
	if err != nil || !ok {
		t.Fatalf("scoped: ok=%v err=%v", ok, err)
	}
	if gotPath != "/@scope/pkg/2.0.0" {
		t.Fatalf("scoped path=%q", gotPath)
	}
}

func TestCheckVersionTimeoutIs30s(t *testing.T) {
	if npm.RequestTimeout != 30*time.Second {
		t.Fatalf("timeout=%s", npm.RequestTimeout)
	}
}
