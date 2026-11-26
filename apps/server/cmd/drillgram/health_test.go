package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestWhereTheServerIsAskedWhetherItIsUp(t *testing.T) {
	for listen, want := range map[string]string{
		":8080":            "http://127.0.0.1:8080/api/health",
		"0.0.0.0:9000":     "http://127.0.0.1:9000/api/health",
		"[::]:8080":        "http://127.0.0.1:8080/api/health",
		"127.0.0.1:8080":   "http://127.0.0.1:8080/api/health",
		"192.0.2.7:8081":   "http://192.0.2.7:8081/api/health",
		"[2001:db8::1]:80": "http://[2001:db8::1]:80/api/health",
	} {
		if got, err := healthURL(listen); err != nil || got != want {
			t.Errorf("listening on %q: asked at %q (%v), want %q", listen, got, err, want)
		}
	}
	if _, err := healthURL("nowhere"); err == nil {
		t.Error("an address that is none was taken")
	}
}

func TestTheHealthCheckSaysWhetherTheServerIsUp(t *testing.T) {
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/health" {
			t.Errorf("asked at %s", r.URL.Path)
		}
	}))
	defer up.Close()
	if err := checkHealth(up.URL + "/api/health"); err != nil {
		t.Errorf("a server that is up: %v", err)
	}

	sick := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, `{"error":"The database does not answer."}`, http.StatusServiceUnavailable)
	}))
	defer sick.Close()
	if err := checkHealth(sick.URL + "/api/health"); err == nil || !strings.Contains(err.Error(), "503") {
		t.Errorf("a server without its database: %v", err)
	}

	sick.Close()
	if err := checkHealth(sick.URL + "/api/health"); err == nil {
		t.Error("a server that is not there counts as up")
	}
}
