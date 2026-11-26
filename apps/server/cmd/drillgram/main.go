// The Drillgram server: the API under /api and, when told where it is, the built web app.
// It is told everything through environment variables (internal/config). `drillgram health`
// asks a running server whether it is up, and says so with its exit status.
package main

import (
	"context"
	"errors"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gofiber/fiber/v3"

	"github.com/mafigit/drillgram/apps/server/internal/api"
	"github.com/mafigit/drillgram/apps/server/internal/config"
	"github.com/mafigit/drillgram/apps/server/internal/store"
)

func main() {
	if err := run(); err != nil {
		slog.Error("the server stopped", "error", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.FromEnv(os.Getenv)
	if err != nil {
		return err
	}
	// `drillgram health`: is the server that runs with this configuration up?
	if len(os.Args) > 1 {
		if os.Args[1] != "health" {
			return errors.New("the only command is health; the server itself takes none")
		}
		address, err := healthURL(cfg.Listen)
		if err != nil {
			return err
		}
		return checkHealth(address)
	}
	// Until the signal that asks the server to stop.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	db, err := store.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return errors.Join(errors.New("the database does not answer"), err)
	}
	defer db.Close()
	if err := db.Migrate(ctx); err != nil {
		return errors.Join(errors.New("the database could not be brought up to date"), err)
	}
	app, err := api.New(ctx, cfg, db)
	if err != nil {
		return err
	}

	// Sessions that are over are of no use to anybody.
	go func() {
		for {
			if err := db.DeleteExpiredSessions(ctx); err != nil && ctx.Err() == nil {
				slog.Warn("old sessions could not be removed", "error", err)
			}
			select {
			case <-ctx.Done():
				return
			case <-time.After(time.Hour):
			}
		}
	}()

	slog.Info("listening", "address", cfg.Listen, "web app", cfg.WebDir != "")
	// The listener stops with the context and lets the requests it has finish.
	return app.Listen(cfg.Listen, fiber.ListenConfig{GracefulContext: ctx, DisableStartupMessage: true, ShutdownTimeout: 10 * time.Second})
}
