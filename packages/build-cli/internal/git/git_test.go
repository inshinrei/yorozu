package git_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/inshinrei/yorozu/packages/build-cli/internal/exec"
	"github.com/inshinrei/yorozu/packages/build-cli/internal/git"
)

func TestLatestTagEmptyWhenNoTags(t *testing.T) {
	dir := initRepo(t)
	writeCommit(t, dir, "README.md", "a\n", "initial")
	tag, err := git.LatestTag(dir)
	if err != nil {
		t.Fatal(err)
	}
	if tag != "" {
		t.Fatalf("tag=%q", tag)
	}
}

func TestLatestTagEmptyWhenNoTagsCanDescribe(t *testing.T) {
	dir := initRepo(t)
	writeCommit(t, dir, "README.md", "a\n", "initial")
	gitRun(t, dir, "checkout", "--orphan", "other")
	writeCommit(t, dir, "other.txt", "b\n", "orphan")
	gitRun(t, dir, "tag", "v-orphan")
	gitRun(t, dir, "checkout", "main")
	tag, err := git.LatestTag(dir)
	if err != nil {
		t.Fatal(err)
	}
	if tag != "" {
		t.Fatalf("tag=%q", tag)
	}
}

func TestLatestTagDescribeFailed(t *testing.T) {
	dir := t.TempDir()
	_, err := git.LatestTag(dir)
	if err == nil || !strings.Contains(err.Error(), "git describe failed:") {
		t.Fatalf("err=%v", err)
	}
}

func TestLatestTagAndTagExists(t *testing.T) {
	dir := initRepo(t)
	writeCommit(t, dir, "README.md", "a\n", "initial")
	gitRun(t, dir, "tag", "v1.2.3")
	tag, err := git.LatestTag(dir)
	if err != nil || tag != "v1.2.3" {
		t.Fatalf("tag=%q err=%v", tag, err)
	}
	ok, err := git.TagExists("v1.2.3", dir)
	if err != nil || !ok {
		t.Fatalf("exists=%v err=%v", ok, err)
	}
	ok, err = git.TagExists("v9.9.9", dir)
	if err != nil || ok {
		t.Fatalf("missing exists=%v err=%v", ok, err)
	}
}

func TestFirstCurrentBranch(t *testing.T) {
	dir := initRepo(t)
	hash := writeCommit(t, dir, "README.md", "a\n", "initial")
	first, err := git.FirstCommit(dir)
	if err != nil || first != hash {
		t.Fatalf("first=%q hash=%q err=%v", first, hash, err)
	}
	cur, err := git.CurrentCommit(dir)
	if err != nil || cur != hash {
		t.Fatalf("current=%q hash=%q err=%v", cur, hash, err)
	}
	branch, err := git.CurrentBranch(dir)
	if err != nil || branch != "main" {
		t.Fatalf("branch=%q err=%v", branch, err)
	}
}

func TestChangedFiles(t *testing.T) {
	dir := initRepo(t)
	a := writeCommit(t, dir, "a.txt", "a\n", "add a")
	writeCommit(t, dir, "b.txt", "b\n", "add b")
	files, err := git.ChangedFiles(a, "HEAD", dir)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(files, ",") != "b.txt" {
		t.Fatalf("files=%v", files)
	}
	empty, err := git.ChangedFiles("HEAD", "HEAD", dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(empty) != 0 {
		t.Fatalf("empty=%v", empty)
	}
}

func TestCommitsBetweenReverseAndParse(t *testing.T) {
	dir := initRepo(t)
	first := writeCommit(t, dir, "a.txt", "a\n", "chore: first")
	writeCommit(t, dir, "b.txt", "b\n", "feat: second")
	writeCommitWithBody(t, dir, "c.txt", "c\n", "fix: third", "body line")

	commits, err := git.CommitsBetween(first, "HEAD", dir, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(commits) != 2 {
		t.Fatalf("len=%d commits=%+v", len(commits), commits)
	}
	if commits[0].Message != "feat: second" || commits[1].Message != "fix: third" {
		t.Fatalf("order/messages=%q %q", commits[0].Message, commits[1].Message)
	}
	if strings.TrimSpace(commits[1].Description) != "body line" {
		t.Fatalf("description=%q", commits[1].Description)
	}
	if commits[0].Author.Name != "Test Author" || commits[0].Author.Email != "author@example.com" {
		t.Fatalf("author=%+v", commits[0].Author)
	}
	if commits[0].Committer.Name != "Test Committer" || commits[0].Committer.Email != "committer@example.com" {
		t.Fatalf("committer=%+v", commits[0].Committer)
	}
	if commits[0].Author.Date.IsZero() || commits[0].Committer.Date.IsZero() {
		t.Fatalf("zero date author=%v committer=%v", commits[0].Author.Date, commits[0].Committer.Date)
	}
	if time.Since(commits[0].Author.Date) > time.Hour {
		t.Fatalf("author date too old: %v", commits[0].Author.Date)
	}

	filtered, err := git.CommitsBetween(first, "HEAD", dir, []string{"c.txt"})
	if err != nil {
		t.Fatal(err)
	}
	if len(filtered) != 1 || filtered[0].Message != "fix: third" {
		t.Fatalf("filtered=%+v", filtered)
	}

	none, err := git.CommitsBetween("HEAD", "HEAD", dir, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(none) != 0 {
		t.Fatalf("none=%+v", none)
	}
}

func initRepo(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	gitRun(t, dir, "init", "-b", "main")
	gitRun(t, dir, "config", "user.name", "Test Author")
	gitRun(t, dir, "config", "user.email", "author@example.com")
	gitRun(t, dir, "config", "commit.gpgsign", "false")
	return dir
}

func writeCommit(t *testing.T, dir, rel, contents, message string) string {
	t.Helper()
	return writeCommitWithBody(t, dir, rel, contents, message, "")
}

func writeCommitWithBody(t *testing.T, dir, rel, contents, message, body string) string {
	t.Helper()
	path := filepath.Join(dir, rel)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(contents), 0o644); err != nil {
		t.Fatal(err)
	}
	gitRun(t, dir, "add", rel)
	if body == "" {
		gitRun(t, dir, "commit", "-m", message)
	} else {
		gitRun(t, dir, "commit", "-m", message, "-m", body)
	}
	return strings.TrimSpace(gitRun(t, dir, "rev-parse", "HEAD"))
}

func gitRun(t *testing.T, dir string, args ...string) string {
	t.Helper()
	env := append(os.Environ(),
		"GIT_AUTHOR_NAME=Test Author",
		"GIT_AUTHOR_EMAIL=author@example.com",
		"GIT_COMMITTER_NAME=Test Committer",
		"GIT_COMMITTER_EMAIL=committer@example.com",
		"GIT_CONFIG_GLOBAL=/dev/null",
		"GIT_CONFIG_SYSTEM=/dev/null",
		"GIT_CONFIG_NOSYSTEM=1",
	)
	res, err := exec.Run(append([]string{"git"}, args...), exec.Options{
		Dir:          dir,
		Env:          env,
		ThrowOnError: true,
	})
	if err != nil {
		t.Fatalf("git %v: %v\nstderr=%s\nstdout=%s", args, err, res.Stderr, res.Stdout)
	}
	return res.Stdout
}
