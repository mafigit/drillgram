package api_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"
)

type workspaceView struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Role string `json:"role"`
	Head int64  `json:"head"`
}

type memberView struct {
	UserID string `json:"userId"`
	Email  string `json:"email"`
	Name   string `json:"name"`
	Role   string `json:"role"`
}

func workspaces(c *client) []workspaceView {
	var all []workspaceView
	c.get("/api/workspaces").is(http.StatusOK).into(&all)
	return all
}

func TestANewUserStartsWithOneWorkspace(t *testing.T) {
	s := start(t)
	all := workspaces(s.user("ada@example.org"))
	if len(all) != 1 || all[0].Name != "My workspace" || all[0].Role != "owner" || all[0].Head != 0 {
		t.Fatalf("the workspaces are %+v", all)
	}
}

func TestAUserHasSeveralWorkspaces(t *testing.T) {
	s := start(t)
	ada := s.user("ada@example.org")

	var made workspaceView
	ada.post("/api/workspaces", obj{"name": "Bookshop"}).is(http.StatusCreated).into(&made)
	if made.ID == "" || made.Name != "Bookshop" || made.Role != "owner" {
		t.Fatalf("the new workspace is %+v", made)
	}
	ada.post("/api/workspaces", obj{"name": "  "}).is(http.StatusBadRequest)
	ada.post("/api/workspaces", obj{"name": strings.Repeat("x", 201)}).is(http.StatusBadRequest)

	// In the order they were made.
	if all := workspaces(ada); len(all) != 2 || all[1].ID != made.ID {
		t.Fatalf("the workspaces are %+v", all)
	}

	var one workspaceView
	ada.get("/api/workspaces/" + made.ID).is(http.StatusOK).into(&one)
	if one != made {
		t.Fatalf("the workspace is %+v, made as %+v", one, made)
	}

	ada.patch("/api/workspaces/"+made.ID, obj{"name": "Book shop"}).is(http.StatusOK)
	if got := ada.get("/api/workspaces/" + made.ID).field("name"); got != "Book shop" {
		t.Fatalf("the name is %v", got)
	}

	ada.delete("/api/workspaces/" + made.ID).is(http.StatusNoContent)
	ada.get("/api/workspaces/" + made.ID).is(http.StatusNotFound)
	if all := workspaces(ada); len(all) != 1 {
		t.Fatalf("the workspaces are %+v", all)
	}
}

func TestAWorkspaceIsNotThereForSomebodyElse(t *testing.T) {
	s := start(t)
	ada, ben := s.user("ada@example.org"), s.user("ben@example.org")
	hers := workspaces(ada)[0].ID

	// Not found, not forbidden: whether it exists is nobody else's to know. An admin of the
	// server is nobody else here too.
	for _, other := range []*client{ben, s.admin()} {
		other.get("/api/workspaces/" + hers).is(http.StatusNotFound)
		other.patch("/api/workspaces/"+hers, obj{"name": "Mine now"}).is(http.StatusNotFound)
		other.delete("/api/workspaces/" + hers).is(http.StatusNotFound)
		other.get("/api/workspaces/" + hers + "/log").is(http.StatusNotFound)
		other.post("/api/workspaces/"+hers+"/log", obj{"after": 0, "entries": []obj{{"type": "x"}}}).is(http.StatusNotFound)
		other.get("/api/workspaces/" + hers + "/members").is(http.StatusNotFound)
	}
	s.client().get("/api/workspaces/" + hers).is(http.StatusUnauthorized)
	ada.get("/api/workspaces/not-an-id").is(http.StatusNotFound)
}

func TestAnOwnerSharesAWorkspace(t *testing.T) {
	s := start(t)
	ada, ben, cleo := s.user("ada@example.org"), s.user("ben@example.org"), s.user("cleo@example.org")
	shared := workspaces(ada)[0].ID
	var benIs, cleoIs userView
	ben.get("/api/me").into(&benIs)
	cleo.get("/api/me").into(&cleoIs)

	ada.post("/api/workspaces/"+shared+"/members", obj{"email": "Ben@example.org", "role": "editor"}).is(http.StatusCreated)
	ada.post("/api/workspaces/"+shared+"/members", obj{"email": "cleo@example.org", "role": "viewer"}).is(http.StatusCreated)
	ada.post("/api/workspaces/"+shared+"/members", obj{"email": "ben@example.org", "role": "viewer"}).is(http.StatusConflict)
	ada.post("/api/workspaces/"+shared+"/members", obj{"email": "nobody@example.org", "role": "viewer"}).is(http.StatusNotFound)
	ada.post("/api/workspaces/"+shared+"/members", obj{"email": "cleo@example.org", "role": "king"}).is(http.StatusBadRequest)

	var members []memberView
	cleo.get("/api/workspaces/" + shared + "/members").is(http.StatusOK).into(&members)
	if len(members) != 3 || members[0].Email != "ada@example.org" || members[0].Role != "owner" || members[1].Role != "editor" || members[2].Role != "viewer" {
		t.Fatalf("the members are %+v", members)
	}

	// It is among the workspaces of each member, with their role.
	var benSees workspaceView
	ben.get("/api/workspaces/" + shared).is(http.StatusOK).into(&benSees)
	if benSees.Role != "editor" || len(workspaces(ben)) != 2 {
		t.Fatalf("Ben sees %+v among %+v", benSees, workspaces(ben))
	}

	// An editor changes the diagrams, a viewer reads them; only an owner changes the workspace.
	entry := obj{"after": 0, "entries": []obj{{"type": "change"}}}
	cleo.post("/api/workspaces/"+shared+"/log", entry).is(http.StatusForbidden)
	ben.post("/api/workspaces/"+shared+"/log", entry).is(http.StatusOK)
	cleo.get("/api/workspaces/" + shared + "/log").is(http.StatusOK)
	for _, notOwner := range []*client{ben, cleo} {
		notOwner.patch("/api/workspaces/"+shared, obj{"name": "Ours"}).is(http.StatusForbidden)
		notOwner.delete("/api/workspaces/" + shared).is(http.StatusForbidden)
		notOwner.post("/api/workspaces/"+shared+"/members", obj{"email": "cleo@example.org", "role": "owner"}).is(http.StatusForbidden)
		notOwner.put("/api/workspaces/"+shared+"/members/"+cleoIs.ID, obj{"role": "owner"}).is(http.StatusForbidden)
		notOwner.delete("/api/workspaces/" + shared + "/members/" + benIs.ID).is(http.StatusForbidden)
	}

	ada.put("/api/workspaces/"+shared+"/members/"+cleoIs.ID, obj{"role": "editor"}).is(http.StatusOK)
	cleo.post("/api/workspaces/"+shared+"/log", obj{"after": 1, "entries": []obj{{"type": "change"}}}).is(http.StatusOK)

	ada.delete("/api/workspaces/" + shared + "/members/" + benIs.ID).is(http.StatusNoContent)
	ben.get("/api/workspaces/" + shared).is(http.StatusNotFound)
	ada.delete("/api/workspaces/" + shared + "/members/" + benIs.ID).is(http.StatusNotFound)
}

func TestAWorkspaceKeepsAnOwner(t *testing.T) {
	s := start(t)
	ada, ben := s.user("ada@example.org"), s.user("ben@example.org")
	shared := workspaces(ada)[0].ID
	var adaIs, benIs userView
	ada.get("/api/me").into(&adaIs)
	ben.get("/api/me").into(&benIs)

	ada.put("/api/workspaces/"+shared+"/members/"+adaIs.ID, obj{"role": "editor"}).is(http.StatusConflict)
	ada.delete("/api/workspaces/" + shared + "/members/" + adaIs.ID).is(http.StatusConflict)

	// With a second owner the first one may go.
	ada.post("/api/workspaces/"+shared+"/members", obj{"email": "ben@example.org", "role": "owner"}).is(http.StatusCreated)
	ada.delete("/api/workspaces/" + shared + "/members/" + adaIs.ID).is(http.StatusNoContent)
	ada.get("/api/workspaces/" + shared).is(http.StatusNotFound)
	ben.patch("/api/workspaces/"+shared, obj{"name": "Ben's"}).is(http.StatusOK)
}

type logView struct {
	Head    int64 `json:"head"`
	Entries []struct {
		Seq   int64           `json:"seq"`
		At    string          `json:"at"`
		By    string          `json:"by"`
		Entry json.RawMessage `json:"entry"`
	} `json:"entries"`
}

func TestTheLogOfAWorkspaceIsAppendedToAndReadInOrder(t *testing.T) {
	s := start(t)
	ada := s.user("ada@example.org")
	var adaIs userView
	ada.get("/api/me").into(&adaIs)
	id := workspaces(ada)[0].ID

	var empty logView
	ada.get("/api/workspaces/" + id + "/log").is(http.StatusOK).into(&empty)
	if empty.Head != 0 || empty.Entries == nil || len(empty.Entries) != 0 {
		t.Fatalf("the log of a new workspace is %+v", empty)
	}

	first := `{"type":"change","at":"2026-01-01T09:00:00.000Z","event":{"type":"objectAdded","view":"overview","kind":"person","name":"Zoë \"Z\" <b>"}}`
	got := ada.post("/api/workspaces/"+id+"/log", obj{"after": 0, "entries": []json.RawMessage{json.RawMessage(first), json.RawMessage(`{"type":"wentTo","position":0}`)}}).is(http.StatusOK)
	if got.field("head") != float64(2) {
		t.Fatalf("the head after two entries is %s", got.body)
	}
	ada.post("/api/workspaces/"+id+"/log", obj{"after": 2, "entries": []obj{{"type": "wentTo", "position": 1}}}).is(http.StatusOK)

	var log logView
	ada.get("/api/workspaces/" + id + "/log").is(http.StatusOK).into(&log)
	if log.Head != 3 || len(log.Entries) != 3 {
		t.Fatalf("the log is %+v", log)
	}
	for i, entry := range log.Entries {
		if entry.Seq != int64(i+1) || entry.By != adaIs.ID || entry.At == "" {
			t.Fatalf("entry %d is %+v", i, entry)
		}
	}
	// What was sent comes back as it was: the server does not read an entry.
	var sent, kept any
	_ = json.Unmarshal([]byte(first), &sent)
	_ = json.Unmarshal(log.Entries[0].Entry, &kept)
	if fmt.Sprint(sent) != fmt.Sprint(kept) {
		t.Fatalf("sent %v, kept %v", sent, kept)
	}

	var rest logView
	ada.get("/api/workspaces/" + id + "/log?after=2").is(http.StatusOK).into(&rest)
	if rest.Head != 3 || len(rest.Entries) != 1 || rest.Entries[0].Seq != 3 {
		t.Fatalf("the log after 2 is %+v", rest)
	}
	if got := ada.get("/api/workspaces/" + id).field("head"); got != float64(3) {
		t.Fatalf("the workspace's head is %v", got)
	}
}

func TestAnAppendThatMissedEntriesIsRefused(t *testing.T) {
	s := start(t)
	ada := s.user("ada@example.org")
	id := workspaces(ada)[0].ID
	one := []obj{{"type": "change"}}

	ada.post("/api/workspaces/"+id+"/log", obj{"after": 0, "entries": one}).is(http.StatusOK)
	// Another tab still thinks the log is empty.
	stale := ada.post("/api/workspaces/"+id+"/log", obj{"after": 0, "entries": one}).is(http.StatusConflict)
	if stale.field("head") != float64(1) {
		t.Fatalf("the refusal says %s", stale.body)
	}
	ada.post("/api/workspaces/"+id+"/log", obj{"after": 5, "entries": one}).is(http.StatusConflict)

	var log logView
	ada.get("/api/workspaces/" + id + "/log").into(&log)
	if log.Head != 1 || len(log.Entries) != 1 {
		t.Fatalf("the log is %+v", log)
	}
}

func TestWhatAnAppendMustBe(t *testing.T) {
	s := start(t)
	ada := s.user("ada@example.org")
	path := "/api/workspaces/" + workspaces(ada)[0].ID + "/log"

	ada.post(path, obj{"after": 0, "entries": []obj{}}).is(http.StatusBadRequest)
	ada.post(path, obj{"after": 0}).is(http.StatusBadRequest)
	ada.post(path, obj{"after": 0, "entries": []any{"no object"}}).is(http.StatusBadRequest)
	ada.post(path, obj{"after": -1, "entries": []obj{{"type": "change"}}}).is(http.StatusBadRequest)
	many := make([]obj, 501)
	for i := range many {
		many[i] = obj{"type": "change"}
	}
	ada.post(path, obj{"after": 0, "entries": many}).is(http.StatusBadRequest)
	ada.get(path + "?after=x").is(http.StatusBadRequest)
}

func TestClearingTheLogStartsTheWorkspaceAgain(t *testing.T) {
	s := start(t)
	ada, ben := s.user("ada@example.org"), s.user("ben@example.org")
	id := workspaces(ada)[0].ID
	ada.post("/api/workspaces/"+id+"/members", obj{"email": "ben@example.org", "role": "editor"}).is(http.StatusCreated)
	ada.post("/api/workspaces/"+id+"/log", obj{"after": 0, "entries": []obj{{"type": "change"}, {"type": "change"}}}).is(http.StatusOK)

	ben.delete("/api/workspaces/" + id + "/log").is(http.StatusForbidden)
	cleared := ada.delete("/api/workspaces/" + id + "/log").is(http.StatusOK)
	if cleared.field("head") != float64(3) {
		t.Fatalf("clearing answers %s", cleared.body)
	}

	// The entries are gone for good; one entry says so, and the count goes on, so a browser
	// that still has the old ones cannot append after them.
	var log logView
	ada.get("/api/workspaces/" + id + "/log").into(&log)
	if log.Head != 3 || len(log.Entries) != 1 || log.Entries[0].Seq != 3 || !strings.Contains(string(log.Entries[0].Entry), `"cleared"`) {
		t.Fatalf("the log is %+v", log)
	}
	ben.post("/api/workspaces/"+id+"/log", obj{"after": 2, "entries": []obj{{"type": "change"}}}).is(http.StatusConflict)
	ben.post("/api/workspaces/"+id+"/log", obj{"after": 3, "entries": []obj{{"type": "change"}}}).is(http.StatusOK)
}
