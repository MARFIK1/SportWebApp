import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

import pool from "@/app/util/helpers/database";

export async function POST(req: Request) {
    try {
        const formData = await req.formData();
        const title = formData.get("title")?.toString();
        const content = formData.get("content")?.toString();
        const tags = formData.get("tags")?.toString()?.split(",").map(tag => tag.trim());
        const imageFile = formData.get("image") as File | null;

        if (!title || !content || !tags) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const userCookie = req.headers.get("cookie")?.match(/user=([^;]+)/);
        const authorId = userCookie ? userCookie[1] : null;
        let imageUrl = null;
        if (imageFile) {
            const uploadsDir = path.join(process.cwd(), "public", "uploads");
            await fs.mkdir(uploadsDir, { recursive: true });
            const filePath = path.join(uploadsDir, imageFile.name);
            const buffer = new Uint8Array(await imageFile.arrayBuffer());
            await fs.writeFile(filePath, buffer);
            imageUrl = `/uploads/${imageFile.name}`;
        }

        await pool.query(
            "INSERT INTO articles (title, content, tags, image, user_id, created_at) VALUES ($1, $2, $3, $4, $5, NOW())",
            [title, content, tags, imageUrl, authorId]
        )

        return NextResponse.json({ message: "Article created successfully" });
    }
    catch (error) {
        console.error("Error creating article:", error);
        return NextResponse.json({ error: "Error creating article" }, { status: 500 });
    }
}