const axios = require("axios");
require("dotenv").config();
const { apiCall } = require("./authService");

const API_HOST = process.env.API_HOST || "http://localhost:3000";

const chalk = require("chalk");
const success = chalk.greenBright;
const error = chalk.redBright;
const info = chalk.cyanBright;

async function extractReminderData(naturalLanguageText) {
  try {
    const response = await apiCall({
      method: "POST",
      url: "/api/v1/reminder/extract",
      data: {
        text: naturalLanguageText,
      },
    });

    if (response.status === 200 && response.data && response.data.success) {
      return {
        success: true,
        data: response.data.data,
        message: response.data.message,
      };
    } else {
      return {
        success: false,
        message: "Failed to extract reminder data",
      };
    }
  } catch (err) {
    if (err.response) {
      // Server responded with error
      return {
        success: false,
        message: err.response.data?.error || "Extraction failed",
      };
    } else if (err.request) {
      // Network error
      return {
        success: false,
        message: `Network error: Cannot connect to ${API_HOST}`,
      };
    } else {
      // Other error
      return {
        success: false,
        message: "An unexpected error occurred during extraction",
      };
    }
  }
}

async function testOpenAIConfig() {
  try {
    const response = await apiCall({
      method: "GET",
      url: "/api/v1/reminder/test-config",
    });

    if (response.status === 200 && response.data && response.data.success) {
      return {
        success: true,
        data: response.data.data,
        message: response.data.message,
      };
    } else {
      return {
        success: false,
        message: "OpenAI configuration test failed",
      };
    }
  } catch (err) {
    if (err.response) {
      return {
        success: false,
        message: err.response.data?.error || "Configuration test failed",
      };
    } else if (err.request) {
      return {
        success: false,
        message: `Network error: Cannot connect to ${API_HOST}`,
      };
    } else {
      return {
        success: false,
        message: "An unexpected error occurred during configuration test",
      };
    }
  }
}

module.exports = {
  extractReminderData,
  testOpenAIConfig,
  API_HOST,
};
