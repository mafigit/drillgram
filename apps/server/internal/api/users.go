package api

import (
	"errors"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gofiber/fiber/v3"

	"github.com/mafigit/drillgram/apps/server/internal/auth"
	"github.com/mafigit/drillgram/apps/server/internal/store"
)

// userView is a user as the API shows them: never with what is kept of their password.
type userView struct {
	ID        string    `json:"id"`
	Email     string    `json:"email"`
	Name      string    `json:"name"`
	Role      string    `json:"role"`
	Disabled  bool      `json:"disabled"`
	CreatedAt time.Time `json:"createdAt"`
}

func viewUser(user store.User) userView {
	return userView{ID: user.ID, Email: user.Email, Name: user.Name, Role: user.Role, Disabled: user.Disabled, CreatedAt: user.CreatedAt}
}

const maxNameLength = 200

func cleanName(text string) (string, bool) {
	name := strings.TrimSpace(text)
	return name, utf8.RuneCountInString(name) <= maxNameLength
}

func hashNewPassword(password string) (string, error) {
	if utf8.RuneCountInString(password) < auth.MinPasswordLength {
		return "", refuse(fiber.StatusBadRequest, "A password has at least 10 characters.")
	}
	// Argon2 reads all of it: a very long one would keep the server busy.
	if len(password) > 1024 {
		return "", refuse(fiber.StatusBadRequest, "A password has at most 1024 characters.")
	}
	return auth.HashPassword(password)
}

func validRole(role string) bool { return role == store.RoleAdmin || role == store.RoleUser }

func (s *server) me(c fiber.Ctx) error {
	asking, _ := asker(c)
	return c.JSON(viewUser(asking.user))
}

func (s *server) editMe(c fiber.Ctx) error {
	asking, _ := asker(c)
	var sent struct {
		Name *string `json:"name"`
	}
	if err := body(c, &sent); err != nil {
		return err
	}
	edit := store.UserEdit{}
	if sent.Name != nil {
		name, ok := cleanName(*sent.Name)
		if !ok {
			return refuse(fiber.StatusBadRequest, "The name is too long.")
		}
		edit.Name = &name
	}
	user, err := s.store.EditUser(c.Context(), asking.user.ID, edit)
	if err != nil {
		return err
	}
	return c.JSON(viewUser(user))
}

func (s *server) changeOwnPassword(c fiber.Ctx) error {
	asking, _ := asker(c)
	var sent struct {
		Current string `json:"current"`
		New     string `json:"new"`
	}
	if err := body(c, &sent); err != nil {
		return err
	}
	if asking.user.PasswordHash == "" {
		return refuse(fiber.StatusForbidden, "This account has no password: it signs in another way.")
	}
	if matches, err := auth.CheckPassword(asking.user.PasswordHash, sent.Current); err != nil {
		return err
	} else if !matches {
		return refuse(fiber.StatusForbidden, "The current password is wrong.")
	}
	hash, err := hashNewPassword(sent.New)
	if err != nil {
		return err
	}
	if err := s.store.SetOwnPassword(c.Context(), asking.user.ID, hash, asking.token); err != nil {
		return err
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func (s *server) listUsers(c fiber.Ctx) error {
	users, err := s.store.Users(c.Context())
	if err != nil {
		return err
	}
	views := make([]userView, len(users))
	for i, user := range users {
		views[i] = viewUser(user)
	}
	return c.JSON(views)
}

func (s *server) createUser(c fiber.Ctx) error {
	var sent struct {
		Email    string `json:"email"`
		Name     string `json:"name"`
		Role     string `json:"role"`
		Password string `json:"password"`
	}
	if err := body(c, &sent); err != nil {
		return err
	}
	email, ok := cleanEmail(sent.Email)
	if !ok {
		return refuse(fiber.StatusBadRequest, "That is no e-mail address.")
	}
	name, ok := cleanName(sent.Name)
	if !ok {
		return refuse(fiber.StatusBadRequest, "The name is too long.")
	}
	if sent.Role == "" {
		sent.Role = store.RoleUser
	}
	if !validRole(sent.Role) {
		return refuse(fiber.StatusBadRequest, "A role is admin or user.")
	}
	new := store.NewUser{Email: email, Name: name, Role: sent.Role}
	// Without a password the user signs in through single sign-on or the proxy only.
	if sent.Password != "" {
		hash, err := hashNewPassword(sent.Password)
		if err != nil {
			return err
		}
		new.PasswordHash = hash
	}
	user, err := s.store.CreateUser(c.Context(), new)
	if errors.Is(err, store.ErrExists) {
		return refuse(fiber.StatusConflict, "There is a user with this e-mail address already.")
	}
	if err != nil {
		return err
	}
	return c.Status(fiber.StatusCreated).JSON(viewUser(user))
}

func (s *server) editUser(c fiber.Ctx) error {
	var sent struct {
		Name     *string `json:"name"`
		Role     *string `json:"role"`
		Disabled *bool   `json:"disabled"`
		Password *string `json:"password"`
	}
	if err := body(c, &sent); err != nil {
		return err
	}
	edit := store.UserEdit{Role: sent.Role, Disabled: sent.Disabled}
	if sent.Name != nil {
		name, ok := cleanName(*sent.Name)
		if !ok {
			return refuse(fiber.StatusBadRequest, "The name is too long.")
		}
		edit.Name = &name
	}
	if sent.Role != nil && !validRole(*sent.Role) {
		return refuse(fiber.StatusBadRequest, "A role is admin or user.")
	}
	if sent.Password != nil {
		hash, err := hashNewPassword(*sent.Password)
		if err != nil {
			return err
		}
		edit.PasswordHash = &hash
	}
	user, err := s.store.EditUser(c.Context(), c.Params("id"), edit)
	if errors.Is(err, store.ErrLastOne) {
		return refuse(fiber.StatusConflict, "The server needs an admin: this is the last one.")
	}
	if err != nil {
		return err
	}
	return c.JSON(viewUser(user))
}
