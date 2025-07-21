const axios = require("axios");
require("dotenv").config();
const { saveToken, loadToken, clearToken } = require("./tokenService");

const API_HOST = process.env.API_HOST || "http://localhost:3000";

async function apiCall(config, { autoRefresh = true } = {}) {
  let token = loadToken();
  if (!config.headers) config.headers = {};
  if (token) config.headers.Authorization = `Bearer ${token}`;

  try {
    const response = await axios({ ...config, baseURL: API_HOST });
    return response;
  } catch (err) {
    if (err.response && err.response.status === 401 && autoRefresh && token) {
      // Try refresh
      const newToken = await refreshToken();
      if (newToken) {
        config.headers.Authorization = `Bearer ${newToken}`;
        return axios({ ...config, baseURL: API_HOST });
      } else {
        clearToken();
        throw new Error("Session expired. Please sign up or log in again.");
      }
    }
    throw err;
  }
}

async function refreshToken() {
  let token = loadToken();
  if (!token) return null;
  try {
    const response = await axios.post(
      `${API_HOST}/api/v1/auth/refresh-token`,
      {},
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (response.data && response.data.data && response.data.data.token) {
      saveToken(response.data.data.token);
      console.log("🔄 Token refreshed in background.");
      return response.data.data.token;
    }
    return null;
  } catch (err) {
    clearToken();
    return null;
  }
}

const chalk = require("chalk");
const success = chalk.greenBright;
const error = chalk.redBright;
const info = chalk.cyanBright;

async function startRegistration(name, email) {
  try {
    const response = await axios.post(
      `${API_HOST}/api/v1/auth/start-registration`,
      {
        name,
        email,
      }
    );

    if (response.status === 200 || response.status === 201) {
      return { success: true, message: "OTP sent to your email" };
    } else {
      return { success: false, message: "Failed to send OTP" };
    }
  } catch (err) {
    if (err.response) {
      return {
        success: false,
        message: err.response.data?.message || "Registration failed",
      };
    } else if (err.request) {
      return {
        success: false,
        message: `Network error: Cannot connect to ${API_HOST}`,
      };
    } else {
      return {
        success: false,
        message: "An unexpected error occurred",
      };
    }
  }
}

async function completeRegistration(email, otp) {
  try {
    const response = await axios.post(
      `${API_HOST}/api/v1/auth/complete-registration`,
      { email, otp }
    );
    if (
      response.status === 200 &&
      response.data &&
      response.data.data &&
      response.data.data.token &&
      response.data.data.user
    ) {
      saveToken(response.data.data.token);
      return {
        success: true,
        message: response.data.message || "Registration completed successfully",
        token: response.data.data.token,
        user: response.data.data.user,
      };
    } else {
      return { success: false, message: "Failed to complete registration" };
    }
  } catch (err) {
    if (err.response) {
      return {
        success: false,
        message: err.response.data?.message || "OTP verification failed",
      };
    } else if (err.request) {
      return {
        success: false,
        message: `Network error: Cannot connect to ${API_HOST}`,
      };
    } else {
      return {
        success: false,
        message: "An unexpected error occurred",
      };
    }
  }
}

async function sendLoginOTP(email) {
  try {
    const response = await axios.post(
      `${API_HOST}/api/v1/auth/send-login-otp`,
      {
        email,
      }
    );

    if (response.status === 200) {
      return { success: true, message: "OTP sent to your email" };
    } else {
      return { success: false, message: "Failed to send OTP" };
    }
  } catch (err) {
    if (err.response) {
      return {
        success: false,
        message: err.response.data?.message || "Failed to send login OTP",
      };
    } else if (err.request) {
      return {
        success: false,
        message: `Network error: Cannot connect to ${API_HOST}`,
      };
    } else {
      return {
        success: false,
        message: "An unexpected error occurred",
      };
    }
  }
}

async function loginWithOTP(email, otp) {
  try {
    const response = await axios.post(
      `${API_HOST}/api/v1/auth/login-with-otp`,
      {
        email,
        otp,
      }
    );
    if (
      response.status === 200 &&
      response.data &&
      response.data.data &&
      response.data.data.token &&
      response.data.data.user
    ) {
      saveToken(response.data.data.token);
      return {
        success: true,
        message: response.data.message || "Login successful",
        token: response.data.data.token,
        user: response.data.data.user,
      };
    } else {
      return { success: false, message: "Failed to login" };
    }
  } catch (err) {
    if (err.response) {
      return {
        success: false,
        message: err.response.data?.message || "Login failed",
      };
    } else if (err.request) {
      return {
        success: false,
        message: `Network error: Cannot connect to ${API_HOST}`,
      };
    } else {
      return {
        success: false,
        message: "An unexpected error occurred",
      };
    }
  }
}

module.exports = {
  startRegistration,
  completeRegistration,
  sendLoginOTP,
  loginWithOTP,
  apiCall,
  refreshToken,
  loadToken,
  saveToken,
  clearToken,
  API_HOST,
};
