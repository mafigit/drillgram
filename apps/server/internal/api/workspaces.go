package api

import (
	"bytes"
	"encoding/json"
	"errors"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gofiber/fiber/v3"

	"github.com/mafigit/drillgram/apps/server/internal/store"
)

type workspaceView struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	// Role is what the one who asks may do in it.
	Role string `json:"role"`
	Head int64  `json:"head"`
}

func viewWorkspace(workspace store.Workspace) workspaceView {
	return workspaceView{ID: workspace.ID, Name: workspace.Name, Role: workspace.Role, Head: workspace.Head}
}

type memberView struct {
	UserID string `json:"userId"`
	Email  string `json:"email"`
	Name   string `json:"name"`
	Role   string `json:"role"`
}

func viewMember(member store.Member) memberView {
	return memberView{UserID: member.UserID, Email: member.Email, Name: member.Name, Role: member.Role}
}

// What a role may do, each more than the one before.
var rank = map[string]int{store.RoleViewer: 1, store.RoleEditor: 2, store.RoleOwner: 3}

// workspace gives the workspace a request is about to a member who is at least `need`. For
// anybody who is no member it is not there.
func (s *server) workspace(c fiber.Ctx, need string) (store.Workspace, who, error) {
	asking, _ := asker(c)
	workspace, err := s.store.Workspace(c.Context(), asking.user.ID, c.Params("id"))
	if err != nil {
		return store.Workspace{}, asking, err
	}
	if rank[workspace.Role] < rank[need] {
		return store.Workspace{}, asking, refuse(fiber.StatusForbidden, "Your role in this workspace does not allow this: you are "+workspace.Role+".")
	}
	return workspace, asking, nil
}

func workspaceName(text string) (string, error) {
	name := strings.TrimSpace(text)
	if name == "" || utf8.RuneCountInString(name) > maxNameLength {
		return "", refuse(fiber.StatusBadRequest, "A workspace has a name of 1 to 200 characters.")
	}
	return name, nil
}

func (s *server) listWorkspaces(c fiber.Ctx) error {
	asking, _ := asker(c)
	workspaces, err := s.store.Workspaces(c.Context(), asking.user.ID)
	if err != nil {
		return err
	}
	views := make([]workspaceView, len(workspaces))
	for i, workspace := range workspaces {
		views[i] = viewWorkspace(workspace)
	}
	return c.JSON(views)
}

func (s *server) createWorkspace(c fiber.Ctx) error {
	asking, _ := asker(c)
	var sent struct {
		Name string `json:"name"`
	}
	if err := body(c, &sent); err != nil {
		return err
	}
	name, err := workspaceName(sent.Name)
	if err != nil {
		return err
	}
	workspace, err := s.store.CreateWorkspace(c.Context(), asking.user.ID, name)
	if err != nil {
		return err
	}
	return c.Status(fiber.StatusCreated).JSON(viewWorkspace(workspace))
}

func (s *server) getWorkspace(c fiber.Ctx) error {
	workspace, _, err := s.workspace(c, store.RoleViewer)
	if err != nil {
		return err
	}
	return c.JSON(viewWorkspace(workspace))
}

func (s *server) renameWorkspace(c fiber.Ctx) error {
	workspace, _, err := s.workspace(c, store.RoleOwner)
	if err != nil {
		return err
	}
	var sent struct {
		Name string `json:"name"`
	}
	if err := body(c, &sent); err != nil {
		return err
	}
	if workspace.Name, err = workspaceName(sent.Name); err != nil {
		return err
	}
	if err := s.store.RenameWorkspace(c.Context(), workspace.ID, workspace.Name); err != nil {
		return err
	}
	return c.JSON(viewWorkspace(workspace))
}

func (s *server) deleteWorkspace(c fiber.Ctx) error {
	workspace, _, err := s.workspace(c, store.RoleOwner)
	if err != nil {
		return err
	}
	if err := s.store.DeleteWorkspace(c.Context(), workspace.ID); err != nil {
		return err
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func (s *server) listMembers(c fiber.Ctx) error {
	workspace, _, err := s.workspace(c, store.RoleViewer)
	if err != nil {
		return err
	}
	members, err := s.store.Members(c.Context(), workspace.ID)
	if err != nil {
		return err
	}
	views := make([]memberView, len(members))
	for i, member := range members {
		views[i] = viewMember(member)
	}
	return c.JSON(views)
}

func memberRole(role string) error {
	if _, ok := rank[role]; !ok {
		return refuse(fiber.StatusBadRequest, "A role in a workspace is owner, editor or viewer.")
	}
	return nil
}

func (s *server) addMember(c fiber.Ctx) error {
	workspace, _, err := s.workspace(c, store.RoleOwner)
	if err != nil {
		return err
	}
	var sent struct {
		Email string `json:"email"`
		Role  string `json:"role"`
	}
	if err := body(c, &sent); err != nil {
		return err
	}
	if err := memberRole(sent.Role); err != nil {
		return err
	}
	member, err := s.store.AddMember(c.Context(), workspace.ID, strings.ToLower(strings.TrimSpace(sent.Email)), sent.Role)
	switch {
	case errors.Is(err, store.ErrExists):
		return refuse(fiber.StatusConflict, "They are a member of this workspace already.")
	case errors.Is(err, store.ErrNotFound):
		return refuse(fiber.StatusNotFound, "There is no user with this e-mail address.")
	case err != nil:
		return err
	}
	return c.Status(fiber.StatusCreated).JSON(viewMember(member))
}

func (s *server) setMemberRole(c fiber.Ctx) error {
	workspace, _, err := s.workspace(c, store.RoleOwner)
	if err != nil {
		return err
	}
	var sent struct {
		Role string `json:"role"`
	}
	if err := body(c, &sent); err != nil {
		return err
	}
	if err := memberRole(sent.Role); err != nil {
		return err
	}
	if err := s.changeMember(c, workspace.ID, sent.Role); err != nil {
		return err
	}
	return c.JSON(fiber.Map{"userId": c.Params("user"), "role": sent.Role})
}

func (s *server) removeMember(c fiber.Ctx) error {
	workspace, _, err := s.workspace(c, store.RoleOwner)
	if err != nil {
		return err
	}
	if err := s.changeMember(c, workspace.ID, ""); err != nil {
		return err
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func (s *server) changeMember(c fiber.Ctx, workspaceID, role string) error {
	err := s.store.SetMemberRole(c.Context(), workspaceID, c.Params("user"), role)
	switch {
	case errors.Is(err, store.ErrLastOne):
		return refuse(fiber.StatusConflict, "A workspace needs an owner: this is the last one.")
	case errors.Is(err, store.ErrNotFound):
		return refuse(fiber.StatusNotFound, "They are no member of this workspace.")
	}
	return err
}

type logEntryView struct {
	Seq   int64           `json:"seq"`
	At    time.Time       `json:"at"`
	By    string          `json:"by"`
	Entry json.RawMessage `json:"entry"`
}

// maxEntries is how many entries one request may add to a log.
const maxEntries = 500

func (s *server) readLog(c fiber.Ctx) error {
	workspace, _, err := s.workspace(c, store.RoleViewer)
	if err != nil {
		return err
	}
	after := int64(0)
	if text := c.Query("after"); text != "" {
		if after, err = strconv.ParseInt(text, 10, 64); err != nil || after < 0 {
			return refuse(fiber.StatusBadRequest, "after is the number of an entry.")
		}
	}
	head, entries, err := s.store.Log(c.Context(), workspace.ID, after)
	if err != nil {
		return err
	}
	views := make([]logEntryView, len(entries))
	for i, entry := range entries {
		views[i] = logEntryView{Seq: entry.Seq, At: entry.At, By: entry.By, Entry: entry.Entry}
	}
	return c.JSON(fiber.Map{"head": head, "entries": views})
}

func (s *server) appendLog(c fiber.Ctx) error {
	workspace, asking, err := s.workspace(c, store.RoleEditor)
	if err != nil {
		return err
	}
	var sent struct {
		After   *int64            `json:"after"`
		Entries []json.RawMessage `json:"entries"`
	}
	if err := body(c, &sent); err != nil {
		return err
	}
	if sent.After == nil || *sent.After < 0 {
		return refuse(fiber.StatusBadRequest, "after is the number of the newest entry you have.")
	}
	if len(sent.Entries) == 0 || len(sent.Entries) > maxEntries {
		return refuse(fiber.StatusBadRequest, "entries holds 1 to 500 entries.")
	}
	for _, entry := range sent.Entries {
		if !bytes.HasPrefix(bytes.TrimSpace(entry), []byte("{")) {
			return refuse(fiber.StatusBadRequest, "An entry is a JSON object.")
		}
	}
	head, err := s.store.Append(c.Context(), workspace.ID, asking.user.ID, *sent.After, sent.Entries)
	if errors.Is(err, store.ErrStale) {
		// The sender reads what it missed (GET …/log?after=) and decides what to do with its own.
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "The log has entries you have not seen.", "head": head})
	}
	if err != nil {
		return err
	}
	return c.JSON(fiber.Map{"head": head})
}

func (s *server) clearLog(c fiber.Ctx) error {
	workspace, asking, err := s.workspace(c, store.RoleOwner)
	if err != nil {
		return err
	}
	head, err := s.store.ClearLog(c.Context(), workspace.ID, asking.user.ID)
	if err != nil {
		return err
	}
	return c.JSON(fiber.Map{"head": head})
}
