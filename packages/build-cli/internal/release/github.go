package release

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	userAgent        = "@yorozu/build"
	githubAPIVersion = "2022-11-28"
	defaultAPIURL    = "https://api.github.com"
	requestTimeout   = 30 * time.Second
	uploadTimeout    = 60 * time.Second
)

type Artifact struct {
	Name string
	Type string
	Body []byte
}

type githubReleaseResponse struct {
	ID        int    `json:"id"`
	UploadURL string `json:"upload_url"`
}

func CreateGithubRelease(token, repo, tag, name, body, apiURL string, artifacts []Artifact) error {
	if apiURL == "" {
		apiURL = defaultAPIURL
	}
	apiURL = strings.TrimRight(apiURL, "/")

	payload, err := json.Marshal(map[string]any{
		"tag_name":   tag,
		"name":       name,
		"body":       body,
		"draft":      false,
		"prerelease": false,
	})
	if err != nil {
		return err
	}

	client := &http.Client{Timeout: requestTimeout}
	req, err := http.NewRequest(http.MethodPost, apiURL+"/repos/"+repo+"/releases", bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", userAgent)
	req.Header.Set("X-GitHub-Api-Version", githubAPIVersion)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	res, err := client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusCreated {
		errBody, _ := io.ReadAll(res.Body)
		return fmt.Errorf("GitHub release request failed with %d: %s", res.StatusCode, string(errBody))
	}

	var release githubReleaseResponse
	if err := json.NewDecoder(res.Body).Decode(&release); err != nil {
		return err
	}

	uploadBase := strings.Split(release.UploadURL, "{")[0]
	uploadClient := &http.Client{Timeout: uploadTimeout}
	for _, file := range artifacts {
		u, err := url.Parse(uploadBase)
		if err != nil {
			return err
		}
		q := u.Query()
		q.Set("name", file.Name)
		u.RawQuery = q.Encode()

		up, err := http.NewRequest(http.MethodPost, u.String(), bytes.NewReader(file.Body))
		if err != nil {
			return err
		}
		up.Header.Set("Accept", "application/vnd.github+json")
		up.Header.Set("User-Agent", userAgent)
		up.Header.Set("X-GitHub-Api-Version", githubAPIVersion)
		up.Header.Set("Authorization", "Bearer "+token)
		up.Header.Set("Content-Type", file.Type)
		up.ContentLength = int64(len(file.Body))

		upRes, err := uploadClient.Do(up)
		if err != nil {
			return err
		}
		if upRes.StatusCode != http.StatusCreated {
			errBody, _ := io.ReadAll(upRes.Body)
			upRes.Body.Close()
			return fmt.Errorf("failed to upload artifact: %s: GitHub artifact upload failed with %d: %s", file.Name, upRes.StatusCode, string(errBody))
		}
		upRes.Body.Close()
	}
	return nil
}
