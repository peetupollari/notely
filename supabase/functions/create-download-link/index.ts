import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { createServiceClient, createUserClient } from "../_shared/supabase.ts";

function readDownloadConfig() {
    return {
        bucket: Deno.env.get("NOTO_DOWNLOAD_BUCKET") || "noto-downloads",
        objectPath: Deno.env.get("NOTO_DOWNLOAD_OBJECT_PATH") || "windows/Noto-Setup-x64.exe"
    };
}

Deno.serve(async (request) => {
    const corsResponse = handleCors(request);
    if (corsResponse) return corsResponse;

    if (request.method !== "POST") {
        return jsonResponse({ error: "Method not allowed." }, 405);
    }

    const authHeader = request.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
        return jsonResponse({ error: "not_authorized" }, 401);
    }

    try {
        const userClient = createUserClient(authHeader);
        const {
            data: { user },
            error: userError
        } = await userClient.auth.getUser();

        if (userError || !user?.email) {
            return jsonResponse({ error: "not_authorized" }, 401);
        }

        const customerEmail = String(user.email).trim().toLowerCase();
        const serviceClient = createServiceClient();
        const purchaseLookup = await serviceClient
            .from("noto_download_purchases")
            .select("stripe_checkout_session_id")
            .eq("customer_email", customerEmail)
            .eq("has_download_access", true)
            .limit(1)
            .maybeSingle();

        if (purchaseLookup.error) {
            throw purchaseLookup.error;
        }

        if (!purchaseLookup.data) {
            return jsonResponse({ error: "no_paid_access" }, 403);
        }

        const downloadConfig = readDownloadConfig();
        const signedUrlResponse = await serviceClient.storage
            .from(downloadConfig.bucket)
            .createSignedUrl(downloadConfig.objectPath, 60);

        if (signedUrlResponse.error || !signedUrlResponse.data?.signedUrl) {
            console.error("Signed URL creation failed:", signedUrlResponse.error);
            return jsonResponse({ error: "download asset is not configured yet" }, 500);
        }

        return jsonResponse({ url: signedUrlResponse.data.signedUrl });
    } catch (error) {
        console.error("create-download-link failed:", error);
        return jsonResponse({ error: "Could not create a secure download link." }, 500);
    }
});
