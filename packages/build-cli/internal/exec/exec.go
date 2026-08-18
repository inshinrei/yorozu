package exec

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"os"
	osexec "os/exec"
	"path/filepath"
	"strings"
)

type Result struct {
	Stdout   string
	Stderr   string
	ExitCode int
}

type Error struct {
	Cmd    []string
	Result Result
}

func (e *Error) Error() string {
	return fmt.Sprintf("Command exited with code %d", e.Result.ExitCode)
}

type Options struct {
	Dir          string
	Env          []string
	Stdin        io.Reader
	InheritIO    bool
	ThrowOnError bool
	Quiet        bool
}

func Run(cmd []string, opts Options) (Result, error) {
	if len(cmd) == 0 {
		return Result{}, errors.New("empty command")
	}

	if opts.InheritIO && !opts.Quiet {
		fmt.Fprintln(os.Stdout, formatCmdLog(cmd, opts.Dir))
	}

	c := osexec.Command(cmd[0], cmd[1:]...)
	if opts.Dir != "" {
		c.Dir = opts.Dir
	}
	if opts.Env != nil {
		c.Env = opts.Env
	}
	if opts.Stdin != nil {
		c.Stdin = opts.Stdin
	} else if opts.InheritIO {
		c.Stdin = os.Stdin
	}

	var stdout, stderr bytes.Buffer
	if opts.InheritIO {
		c.Stdout = os.Stdout
		c.Stderr = os.Stderr
	} else {
		c.Stdout = &stdout
		c.Stderr = &stderr
	}

	err := c.Run()
	result := Result{
		Stdout:   stdout.String(),
		Stderr:   stderr.String(),
		ExitCode: 0,
	}
	if err != nil {
		var exitErr *osexec.ExitError
		if errors.As(err, &exitErr) {
			result.ExitCode = exitErr.ExitCode()
			if opts.ThrowOnError {
				return result, &Error{Cmd: cmd, Result: result}
			}
			return result, nil
		}
		return result, err
	}
	return result, nil
}

func formatCmdLog(cmd []string, dir string) string {
	cmdStr := joinCmd(cmd)
	cwdStr := ""
	if dir != "" {
		normCwd, err := filepath.Abs(dir)
		if err == nil {
			wd, err := os.Getwd()
			if err == nil && normCwd != wd {
				rel, err := filepath.Rel(wd, normCwd)
				if err == nil {
					cwdStr = "\x1b[;3m" + rel + "\x1b[;23m "
				}
			}
		}
	}
	return cwdStr + "\x1b[;34m$\x1b[;0m " + cmdStr
}

func joinCmd(cmd []string) string {
	parts := make([]string, len(cmd))
	for i, part := range cmd {
		if strings.Contains(part, " ") {
			parts[i] = `"` + strings.ReplaceAll(part, `"`, `\"`) + `"`
		} else {
			parts[i] = part
		}
	}
	return strings.Join(parts, " ")
}
