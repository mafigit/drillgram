package api_test

import (
	"net/http"
	"testing"
)

type userView struct {
	ID       string `json:"id"`
	Email    string `json:"email"`
	Name     string `json:"name"`
	Role     string `json:"role"`
	Disabled bool   `json:"disabled"`
}

func TestOnlyAnAdminManagesUsers(t *testing.T) {
	s := start(t)
	ada := s.user("ada@example.org")

	ada.get("/api/users").is(http.StatusForbidden)
	ada.post("/api/users", obj{"email": "x@example.org", "password": "a long enough password"}).is(http.StatusForbidden)
	s.client().get("/api/users").is(http.StatusUnauthorized)
}

func TestAnAdminCreatesAndListsUsers(t *testing.T) {
	s := start(t)
	admin := s.admin()

	var made userView
	admin.post("/api/users", obj{"email": "Ada@Example.org", "name": "Ada", "password": "a long enough password"}).is(http.StatusCreated).into(&made)
	if made.ID == "" || made.Email != "ada@example.org" || made.Name != "Ada" || made.Role != "user" || made.Disabled {
		t.Fatalf("the new user is %+v", made)
	}

	var all []userView
	admin.get("/api/users").is(http.StatusOK).into(&all)
	if len(all) != 2 || all[0].Email != adminEmail || all[1].Email != "ada@example.org" {
		t.Fatalf("the users are %+v", all)
	}

	s.signedIn("ada@example.org", "a long enough password").get("/api/me").is(http.StatusOK)
}

func TestWhatANewUserMustHave(t *testing.T) {
	s := start(t)
	admin := s.admin()

	admin.post("/api/users", obj{"email": "not an address", "password": "a long enough password"}).is(http.StatusBadRequest)
	admin.post("/api/users", obj{"email": "ada@example.org", "password": "short"}).is(http.StatusBadRequest)
	admin.post("/api/users", obj{"email": "ada@example.org", "password": "a long enough password", "role": "king"}).is(http.StatusBadRequest)
	admin.post("/api/users", obj{"email": adminEmail, "password": "a long enough password"}).is(http.StatusConflict)
	// No password: such a user signs in through single sign-on or the proxy only.
	admin.post("/api/users", obj{"email": "sso@example.org"}).is(http.StatusCreated)
	s.client().post("/api/auth/login", obj{"email": "sso@example.org", "password": ""}).is(http.StatusUnauthorized)
}

func TestThePasswordNeverLeavesTheServer(t *testing.T) {
	s := start(t)
	admin := s.admin()
	admin.post("/api/users", obj{"email": "ada@example.org", "password": "a long enough password"}).is(http.StatusCreated)

	var all []map[string]any
	admin.get("/api/users").is(http.StatusOK).into(&all)
	for _, user := range all {
		for field := range user {
			if field != "id" && field != "email" && field != "name" && field != "role" && field != "disabled" && field != "createdAt" {
				t.Fatalf("a user carries the field %q", field)
			}
		}
	}
}

func TestAnAdminEditsAUser(t *testing.T) {
	s := start(t)
	admin := s.admin()
	ada := s.user("ada@example.org")
	var who userView
	ada.get("/api/me").is(http.StatusOK).into(&who)

	var edited userView
	admin.patch("/api/users/"+who.ID, obj{"name": "Ada L.", "role": "admin"}).is(http.StatusOK).into(&edited)
	if edited.Name != "Ada L." || edited.Role != "admin" {
		t.Fatalf("the edited user is %+v", edited)
	}
	ada.get("/api/users").is(http.StatusOK)

	admin.patch("/api/users/"+who.ID, obj{"password": "another long password"}).is(http.StatusOK)
	s.client().post("/api/auth/login", obj{"email": "ada@example.org", "password": "a long enough password"}).is(http.StatusUnauthorized)
	s.signedIn("ada@example.org", "another long password")

	admin.patch("/api/users/00000000-0000-0000-0000-000000000000", obj{"name": "Nobody"}).is(http.StatusNotFound)
	admin.patch("/api/users/not-an-id", obj{"name": "Nobody"}).is(http.StatusNotFound)
}

func TestADisabledUserIsOutAtOnceAndCannotSignIn(t *testing.T) {
	s := start(t)
	admin := s.admin()
	ada := s.user("ada@example.org")
	var who userView
	ada.get("/api/me").is(http.StatusOK).into(&who)

	admin.patch("/api/users/"+who.ID, obj{"disabled": true}).is(http.StatusOK)
	ada.get("/api/me").is(http.StatusUnauthorized)
	s.client().post("/api/auth/login", obj{"email": "ada@example.org", "password": "a long enough password"}).is(http.StatusUnauthorized)

	admin.patch("/api/users/"+who.ID, obj{"disabled": false}).is(http.StatusOK)
	s.signedIn("ada@example.org", "a long enough password")
}

func TestTheLastAdminStays(t *testing.T) {
	s := start(t)
	admin := s.admin()
	var me userView
	admin.get("/api/me").is(http.StatusOK).into(&me)

	admin.patch("/api/users/"+me.ID, obj{"role": "user"}).is(http.StatusConflict)
	admin.patch("/api/users/"+me.ID, obj{"disabled": true}).is(http.StatusConflict)
	admin.get("/api/me").is(http.StatusOK)
}

func TestAUserChangesTheirOwnNameAndPassword(t *testing.T) {
	s := start(t)
	ada := s.user("ada@example.org")
	elsewhere := s.signedIn("ada@example.org", "a long enough password")

	ada.patch("/api/me", obj{"name": "Ada Lovelace"}).is(http.StatusOK)
	if got := ada.get("/api/me").is(http.StatusOK).field("name"); got != "Ada Lovelace" {
		t.Fatalf("the name is %v", got)
	}

	ada.post("/api/me/password", obj{"current": "wrong", "new": "another long password"}).is(http.StatusForbidden)
	ada.post("/api/me/password", obj{"current": "a long enough password", "new": "short"}).is(http.StatusBadRequest)
	ada.post("/api/me/password", obj{"current": "a long enough password", "new": "another long password"}).is(http.StatusNoContent)

	// The browser that changed it stays signed in; every other session of the user ends.
	ada.get("/api/me").is(http.StatusOK)
	elsewhere.get("/api/me").is(http.StatusUnauthorized)
	s.signedIn("ada@example.org", "another long password")
}
