package ci

import (
	"crypto/rand"
	"errors"
	"fmt"
	"os"
	"strings"
)

func Running() bool {
	return os.Getenv("GITHUB_ACTIONS") != ""
}

func Input(name string) string {
	key := "INPUT_" + strings.ToUpper(strings.ReplaceAll(name, " ", "_"))
	val, ok := os.LookupEnv(key)
	if !ok {
		return ""
	}
	return strings.TrimSpace(val)
}

func WriteOutput(name, value string) error {
	path, ok := os.LookupEnv("GITHUB_OUTPUT")
	if !ok {
		return errors.New("GITHUB_OUTPUT is not set")
	}
	if !strings.Contains(value, "\n") {
		return appendOutput(path, name+"="+value+"\n")
	}
	delim := "---" + randomUUID() + "---"
	return appendOutput(path, name+"<<"+delim+"\n"+value+"\n"+delim+"\n")
}

func appendOutput(path, content string) error {
	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = f.WriteString(content)
	return err
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
