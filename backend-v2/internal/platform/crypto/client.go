package crypto

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type Client struct {
	baseURL string
	http    *http.Client
}

type TokenClaims struct {
	Subject  string `json:"subject"`
	Username string `json:"username"`
	IssuedAt int64  `json:"issued_at"`
	Expires  int64  `json:"expires_at"`
}

func NewClient(baseURL string) *Client {
	return &Client{
		baseURL: baseURL,
		http:    &http.Client{Timeout: 3 * time.Second},
	}
}

func (c *Client) HashPassword(ctx context.Context, password string) (string, error) {
	var response struct {
		Hash string `json:"hash"`
	}
	err := c.post(ctx, "/internal/v1/password/hash", map[string]string{"password": password}, &response)
	return response.Hash, err
}

func (c *Client) VerifyPassword(ctx context.Context, password, hash string) (bool, error) {
	var response struct {
		Valid bool `json:"valid"`
	}
	err := c.post(ctx, "/internal/v1/password/verify", map[string]string{"password": password, "hash": hash}, &response)
	return response.Valid, err
}

func (c *Client) IssueToken(ctx context.Context, subject, username string) (string, error) {
	var response struct {
		Token string `json:"token"`
	}
	err := c.post(ctx, "/internal/v1/token/issue", map[string]string{"subject": subject, "username": username}, &response)
	return response.Token, err
}

func (c *Client) VerifyToken(ctx context.Context, token string) (TokenClaims, error) {
	var response TokenClaims
	err := c.post(ctx, "/internal/v1/token/verify", map[string]string{"token": token}, &response)
	return response, err
}

func (c *Client) post(ctx context.Context, path string, request, response any) error {
	body, err := json.Marshal(request)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+path, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return fmt.Errorf("crypto service returned %s", res.Status)
	}
	return json.NewDecoder(res.Body).Decode(response)
}
