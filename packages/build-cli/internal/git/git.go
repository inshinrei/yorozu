package git

import (
	"crypto/rand"
	"fmt"
	"regexp"
	"slices"
	"strings"
	"time"

	"github.com/inshinrei/yorozu/packages/build-cli/internal/exec"
)

type Person struct {
	Name  string
	Email string
	Date  time.Time
}

type Commit struct {
	Hash        string
	Author      Person
	Committer   Person
	Message     string
	Description string
}

var noTagsRe = regexp.MustCompile(`(?i)^fatal: (?:No names found|No tags can describe)`)

func LatestTag(cwd string) (string, error) {
	res, err := exec.Run([]string{"git", "describe", "--abbrev=0", "--tags"}, exec.Options{Dir: cwd})
	if err != nil {
		return "", err
	}
	if res.ExitCode != 0 {
		if noTagsRe.MatchString(res.Stderr) {
			return "", nil
		}
		return "", fmt.Errorf("git describe failed: %s", res.Stderr)
	}
	return strings.TrimSpace(res.Stdout), nil
}

func FirstCommit(cwd string) (string, error) {
	res, err := exec.Run([]string{"git", "rev-list", "--max-parents=0", "HEAD"}, exec.Options{
		Dir:          cwd,
		ThrowOnError: true,
	})
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(res.Stdout), nil
}

func CurrentCommit(cwd string) (string, error) {
	res, err := exec.Run([]string{"git", "rev-parse", "HEAD"}, exec.Options{
		Dir:          cwd,
		ThrowOnError: true,
	})
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(res.Stdout), nil
}

func CurrentBranch(cwd string) (string, error) {
	res, err := exec.Run([]string{"git", "rev-parse", "--abbrev-ref", "HEAD"}, exec.Options{
		Dir:          cwd,
		ThrowOnError: true,
	})
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(res.Stdout), nil
}

func TagExists(tag, cwd string) (bool, error) {
	res, err := exec.Run([]string{"git", "tag", "--list", tag}, exec.Options{
		Dir:          cwd,
		ThrowOnError: true,
	})
	if err != nil {
		return false, err
	}
	return strings.TrimSpace(res.Stdout) != "", nil
}

func ChangedFiles(since, until, cwd string) ([]string, error) {
	if until == "" {
		until = "HEAD"
	}
	res, err := exec.Run([]string{"git", "diff", "--name-only", since, until}, exec.Options{
		Dir:          cwd,
		ThrowOnError: true,
	})
	if err != nil {
		return nil, err
	}
	files := strings.Split(strings.TrimSpace(res.Stdout), "\n")
	if len(files) == 1 && files[0] == "" {
		return []string{}, nil
	}
	return files, nil
}

func CommitsBetween(since, until, cwd string, files []string) ([]Commit, error) {
	if until == "" {
		until = "HEAD"
	}
	delim := "---" + randomUUID() + "---"
	rev := until
	if since != "" {
		rev = since + ".." + until
	}
	cmd := []string{
		"git",
		"log",
		"--pretty=format:%H %s%n%an%n%ae%n%aI%n%cn%n%ce%n%cI%n%b%n" + delim,
		rev,
	}
	if len(files) > 0 {
		cmd = append(cmd, "--")
		cmd = append(cmd, files...)
	}
	res, err := exec.Run(cmd, exec.Options{
		Dir:          cwd,
		ThrowOnError: true,
	})
	if err != nil {
		return nil, err
	}

	lines := strings.Split(strings.TrimSpace(res.Stdout), "\n")
	if len(lines) == 1 && lines[0] == "" {
		return []Commit{}, nil
	}

	var items []Commit
	var current *Commit
	for i := 0; i < len(lines); i++ {
		line := lines[i]
		if line == delim {
			if current != nil {
				items = append(items, *current)
			}
			current = nil
			continue
		}
		if current != nil {
			if current.Description != "" {
				current.Description += "\n"
			}
			current.Description += line
			continue
		}
		parts := strings.Split(line, " ")
		hash := parts[0]
		msg := strings.Join(parts[1:], " ")
		i++
		authorName := lines[i]
		i++
		authorEmail := lines[i]
		i++
		authorDate := lines[i]
		i++
		committerName := lines[i]
		i++
		committerEmail := lines[i]
		i++
		committerDate := lines[i]
		current = &Commit{
			Hash: hash,
			Author: Person{
				Name:  authorName,
				Email: authorEmail,
				Date:  parseGitDate(authorDate),
			},
			Committer: Person{
				Name:  committerName,
				Email: committerEmail,
				Date:  parseGitDate(committerDate),
			},
			Message:     msg,
			Description: "",
		}
	}
	if current != nil {
		items = append(items, *current)
	}
	if items == nil {
		items = []Commit{}
	}
	slices.Reverse(items)
	return items, nil
}

func parseGitDate(s string) time.Time {
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		t, err = time.Parse(time.RFC3339Nano, s)
		if err != nil {
			return time.Time{}
		}
	}
	return t
}

func randomUUID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic(err)
	}
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:])
}
