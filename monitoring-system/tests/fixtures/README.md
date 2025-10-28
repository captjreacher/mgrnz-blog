# Test Fixtures

This directory stores reusable fixtures for analytics and reporting tests. Keep the following guidelines in mind when adding or updating fixture data:

- **Scope**: Fixtures should be scoped to automated tests only. Do not reference production data or secrets.
- **Structure**: Prefer exported factory functions that allow callers to tweak specific fields without mutating shared objects.
- **Timestamps**: Use deterministic timestamps where possible. When relying on `Date.now()`, document the expectation in the test to avoid flaky assertions.
- **Cleanup**: Integration tests that create files should place them under the `test-data` directory so that the global test setup can remove them safely.
- **Documentation**: Update this README when new fixture patterns or constraints are introduced.

Following these notes helps maintain consistent, predictable analytics tests as the monitoring system evolves.
