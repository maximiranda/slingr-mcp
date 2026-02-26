import axios, { type AxiosInstance } from "axios";
import dotenv from "dotenv";

dotenv.config();

const SLINGR_BUILDER_API_URL = process.env.SLINGR_BUILDER_API_URL || process.env.SLINGR_API_URL;
const SLINGR_RUNTIME_API_URL = process.env.SLINGR_RUNTIME_API_URL || SLINGR_BUILDER_API_URL?.replace('/builder/api', '/runtime/api');
const SLINGR_EMAIL = process.env.SLINGR_EMAIL;
const SLINGR_PASSWORD = process.env.SLINGR_PASSWORD;

if (!SLINGR_EMAIL || !SLINGR_PASSWORD || !SLINGR_BUILDER_API_URL || !SLINGR_RUNTIME_API_URL) {
    throw new Error("Error: SLINGR_EMAIL, SLINGR_PASSWORD, SLINGR_BUILDER_API_URL or SLINGR_RUNTIME_API_URL not defined in .env");
}

export const builderClient: AxiosInstance = axios.create({
    baseURL: SLINGR_BUILDER_API_URL,
    headers: {
        "Content-Type": "application/json",
    },
});

export const runtimeClient: AxiosInstance = axios.create({
    baseURL: SLINGR_RUNTIME_API_URL,
    headers: {
        "Content-Type": "application/json",
    },
});

export async function loginToSlingr(): Promise<void> {
    const defaultLoginUrl = `${new URL(SLINGR_BUILDER_API_URL as string).origin}/dev/builder/api/auth/login`;
    const loginUrl = process.env.SLINGR_LOGIN_URL || defaultLoginUrl;

    try {
        const response = await axios.post(loginUrl, {
            email: SLINGR_EMAIL,
            password: SLINGR_PASSWORD
        }, {
            headers: {
                "Content-Type": "application/json"
            }
        });

        const token = response.data?.token;

        if (!token) {
            throw new Error("Login response did not contain a token.");
        }

        // Apply token to both Axios instances
        builderClient.defaults.headers.common["token"] = token;
        runtimeClient.defaults.headers.common["token"] = token;
        console.error("✅ Successfully logged in to Slingr API.");

    } catch (error: any) {
        const errorMsg = error.response
            ? `Status: ${error.response.status}, Body: ${JSON.stringify(error.response.data)}`
            : error.message;
        throw new Error(`Failed to login to Slingr API: ${errorMsg}`);
    }
}
