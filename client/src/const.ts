import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

/**
 * Redirect to the login page.
 */
export const startLogin = () => {
  window.location.href = "/api/auth/login-page";
};
