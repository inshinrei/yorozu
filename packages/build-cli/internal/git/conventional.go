package git

import (
	"regexp"
	"strings"
)

type Conventional struct {
	Type     string
	Scope    string
	Subject  string
	Breaking bool
}

var (
	conventionalCommitRe = regexp.MustCompile(`^(\w+)(?:\(([^)]+)\))?(!?): (.+)$`)
	breakingChangeRe     = regexp.MustCompile(`^BREAKING[- ]CHANGE:`)
)

func ParseConventional(msg string) *Conventional {
	parts := strings.Split(msg, "\n")
	header := parts[0]
	match := conventionalCommitRe.FindStringSubmatch(header)
	if match == nil {
		return nil
	}
	footerBreaking := false
	for _, line := range parts[1:] {
		if breakingChangeRe.MatchString(strings.TrimSpace(line)) {
			footerBreaking = true
			break
		}
	}
	return &Conventional{
		Type:     match[1],
		Scope:    match[2],
		Subject:  match[4],
		Breaking: match[3] != "" || footerBreaking,
	}
}
