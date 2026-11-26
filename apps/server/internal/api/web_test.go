package api_test

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/mafigit/drillgram/apps/server/internal/config"
)

// builtApp is a folder as the web app's build leaves it.
func builtApp(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	for name, text := range map[string]string{
		"index.html":           "<!doctype html><title>Drillgram</title>",
		"sw.js":                "// the service worker",
		"assets/index-abc.js":  "console.log('app')",
		"tech-icons/go.svg":    "<svg/>",
		"manifest.webmanifest": "{}",
	} {
		path := filepath.Join(dir, name)
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(text), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return dir
}

func TestTheServerServesTheWebApp(t *testing.T) {
	dir := builtApp(t)
	s := start(t, func(cfg *config.Config) { cfg.WebDir = dir })
	c := s.client()

	page := c.get("/").is(http.StatusOK)
	if !strings.Contains(page.body, "<title>Drillgram</title>") || !strings.HasPrefix(page.header.Get("Content-Type"), "text/html") {
		t.Fatalf("the start page is %q (%s)", page.body, page.header.Get("Content-Type"))
	}
	if script := c.get("/assets/index-abc.js").is(http.StatusOK); script.body != "console.log('app')" {
		t.Fatalf("the script is %q", script.body)
	}

	// An address of the app itself (a diagram, the sign-in page) is the app: it reads the address.
	for _, path := range []string{"/view/inside-WebShop", "/login", "/login?error=No+account", "/w/1f0e/view/x.y"} {
		if got := c.get(path).is(http.StatusOK); !strings.Contains(got.body, "<title>Drillgram</title>") {
			t.Fatalf("%s gives %q", path, got.body)
		}
	}
	// A file that is not there is not the app: a script must not get a page.
	c.get("/assets/gone.js").is(http.StatusNotFound)
	c.get("/tech-icons/none.svg").is(http.StatusNotFound)
	// The API stays the API.
	if got := c.get("/api/nothing-here").is(http.StatusNotFound); got.field("error") == nil {
		t.Fatalf("the API answers %s", got.body)
	}
	c.get("/api/health").is(http.StatusOK)
	// Nothing above the folder.
	c.get("/../go.mod").is(http.StatusNotFound)
	c.get("/assets/..%2f..%2fgo.mod").is(http.StatusNotFound)
}

func TestWhatABrowserMayKeepOfTheWebApp(t *testing.T) {
	dir := builtApp(t)
	s := start(t, func(cfg *config.Config) { cfg.WebDir = dir })
	c := s.client()

	// The page and the service worker name the files of a build: a browser asks again each time.
	for _, path := range []string{"/", "/sw.js", "/view/inside-WebShop", "/manifest.webmanifest"} {
		if got := c.get(path).is(http.StatusOK).header.Get("Cache-Control"); got != "no-cache" {
			t.Errorf("%s: Cache-Control is %q", path, got)
		}
	}
	// A file of assets/ has its content in its name: it never changes.
	if got := c.get("/assets/index-abc.js").is(http.StatusOK).header.Get("Cache-Control"); got != "public, max-age=31536000, immutable" {
		t.Errorf("an asset: Cache-Control is %q", got)
	}
}

func TestWithoutAWebAppTheServerIsTheAPIAlone(t *testing.T) {
	s := start(t)
	s.client().get("/").is(http.StatusNotFound)
	s.client().get("/api/health").is(http.StatusOK)
}
