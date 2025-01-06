import pool from "@/app/util/helpers/database";
import fs from "fs/promises";
import path from "path";

export async function POST(req: Request) {
    try {
        const data = await req.formData();
        const file = data.get("avatar") as Blob;
        const userId = data.get("userId") as string;
        if (!file || !userId) {
            return new Response("Missing data", { status: 400 });
        }

        const buffer = new Uint8Array(await file.arrayBuffer());
        const timestamp = Date.now();
        const uploadPath = path.join(process.cwd(), "public/avatars", `${userId}-${timestamp}.jpg`);
        await fs.writeFile(uploadPath, buffer);
        await pool.query("UPDATE users SET profile_picture = $1 WHERE id = $2", [
            `/avatars/${userId}-${timestamp}.jpg`,
            userId
        ])

        return new Response(
            JSON.stringify({ avatarUrl: `/avatars/${userId}-${timestamp}.jpg` }),
            {
                status: 200,
                headers: { "Content-Type": "application/json" },
            }
        )
    }
    catch (error) {
        console.error("Error updating avatar:", error);
        return new Response("Internal Server Error", { status: 500 });
    }
}