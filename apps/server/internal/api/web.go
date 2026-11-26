package api

import (
	"errors"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"strings"

	"github.com/gofiber/fiber/v3"
)

// serveWeb gives out the built web app from a folder. The app has addresses of its own (a
// diagram, the sign-in page) that are no files: for those the browser gets the app's page,
// which reads the address. A file that is asked for by its name and is not there is not found.
func serveWeb(app *fiber.App, dir string) error {
	dir, err := filepath.Abs(dir)
	if err != nil {
		return err
	}
	files := os.DirFS(dir)
	app.Get("/*", func(c fiber.Ctx) error {
		name := strings.TrimPrefix(path.Clean("/"+c.Path()), "/")
		if name == "" {
			name = "index.html"
		}
		// fs.ValidPath refuses what would lead out of the folder.
		if info, err := fs.Stat(files, name); !fs.ValidPath(name) || err != nil || info.IsDir() {
			if err != nil && !errors.Is(err, fs.ErrNotExist) && fs.ValidPath(name) {
				return err
			}
			if path.Ext(name) != "" && !strings.HasPrefix(name, "w/") && !strings.HasPrefix(name, "view/") {
				return fiber.NewError(fiber.StatusNotFound, "There is no such file.")
			}
			name = "index.html"
		}
		// A file of assets/ carries its content's hash in its name. Everything else is asked
		// for again each time: the page and the service worker say which build is the current one.
		if strings.HasPrefix(name, "assets/") {
			c.Set(fiber.HeaderCacheControl, "public, max-age=31536000, immutable")
		} else {
			c.Set(fiber.HeaderCacheControl, "no-cache")
		}
		// name is a file of the folder: fs.ValidPath and fs.Stat said so above.
		return c.SendFile(filepath.Join(dir, filepath.FromSlash(name)))
	})
	return nil
}
