package main

import (
	"fmt"
	"net"
	"net/http"
	"time"
)

// healthURL is where a server that listens on an address is asked whether it is up, from the
// same machine: an address that means "every address" is reached at this machine's own.
func healthURL(listen string) (string, error) {
	host, port, err := net.SplitHostPort(listen)
	if err != nil {
		return "", fmt.Errorf("DRILLGRAM_LISTEN is no address: %w", err)
	}
	if ip := net.ParseIP(host); host == "" || (ip != nil && ip.IsUnspecified()) {
		host = "127.0.0.1"
	}
	return "http://" + net.JoinHostPort(host, port) + "/api/health", nil
}

// checkHealth asks the server whether it and its database are up: `drillgram health`, for a
// container's health check, where there is no other program to ask with.
func checkHealth(address string) error {
	client := http.Client{Timeout: 3 * time.Second}
	answer, err := client.Get(address)
	if err != nil {
		return err
	}
	defer answer.Body.Close()
	if answer.StatusCode != http.StatusOK {
		return fmt.Errorf("the server answers %d", answer.StatusCode)
	}
	return nil
}
