import { APPROVED_EMAILS, ApprovedPerson } from "../types";

const CLIENT_ID = "252878403524-qrc35g8o5mmhbg7u5mskvmvoe91kqc49.apps.googleusercontent.com";
const SCOPES = "https://www.googleapis.com/auth/calendar";

export interface LoggedInUser {
  email: string;
  name: string;
  role: ApprovedPerson;
  picture?: string;
}

export const authService = {
  getAccessToken(): string | null {
    const token = localStorage.getItem("vs_access_token");
    const expiry = localStorage.getItem("vs_token_expiry");
    if (!token || !expiry) return null;
    
    // Check if expired
    if (Date.now() > parseInt(expiry, 10)) {
      this.logout();
      return null;
    }
    return token;
  },

  getLoggedInUser(): LoggedInUser | null {
    const userJson = localStorage.getItem("vs_user");
    if (!userJson) return null;
    try {
      return JSON.parse(userJson);
    } catch {
      return null;
    }
  },

  isLoggedIn(): boolean {
    return this.getAccessToken() !== null && this.getLoggedInUser() !== null;
  },

  logout(): void {
    localStorage.removeItem("vs_access_token");
    localStorage.removeItem("vs_token_expiry");
    localStorage.removeItem("vs_user");
  },

  async requestToken(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Ensure GIS is loaded
      if (typeof window === "undefined" || !(window as any).google) {
        reject(new Error("Google Identity Services script not loaded. Please wait or reload."));
        return;
      }

      const client = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: async (response: any) => {
          if (response.error_subtype) {
            reject(new Error(`OAuth error: ${response.error}`));
            return;
          }
          if (!response.access_token) {
            reject(new Error("No access token returned"));
            return;
          }

          try {
            // Fetch profile info using token to check email
            const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
              headers: {
                Authorization: `Bearer ${response.access_token}`
              }
            });

            if (!userInfoRes.ok) {
              throw new Error("Failed to fetch user info from Google");
            }

            const userInfo = await userInfoRes.json();
            const email = userInfo.email?.toLowerCase();

            if (!email) {
              throw new Error("User email not found in Google profile");
            }

            // Check if authorized
            if (!(email in APPROVED_EMAILS)) {
              throw new Error(`Email ${email} is not authorized to use the booking scheduler.`);
            }

            const role = APPROVED_EMAILS[email];
            const loggedInUser: LoggedInUser = {
              email,
              name: userInfo.name || toTitleCase(role),
              role,
              picture: userInfo.picture
            };

            // Save token and user details
            const expiresInSec = response.expires_in || 3600;
            const expiryTime = Date.now() + (expiresInSec - 60) * 1000; // 1 min buffer

            localStorage.setItem("vs_access_token", response.access_token);
            localStorage.setItem("vs_token_expiry", expiryTime.toString());
            localStorage.setItem("vs_user", JSON.stringify(loggedInUser));

            resolve();
          } catch (err: any) {
            reject(err);
          }
        }
      });

      client.requestAccessToken({ prompt: "" });
    });
  }
};

function toTitleCase(str: string): string {
  return str.split("_")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}
