import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import pool from "@/app/util/helpers/database";

export async function POST(req: Request, { params } : { params: { id: string } }) {
    try {
        const { id } = params;
        const { content } = await req.json();
        const user = cookies().get("user");
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const userResult = await pool.query(
            "SELECT id, nickname, profile_picture FROM users WHERE id = $1",
            [user.value]
        )
        if (userResult.rowCount === 0) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        const userData = userResult.rows[0];
        const result = await pool.query(
            `INSERT INTO comments (content, article_id, user_id, created_at) 
            VALUES ($1, $2, $3, NOW()) 
            RETURNING id, content, created_at`,
            [content, id, userData.id]
        )

        const newComment = {
            ...result.rows[0],
            author: userData.nickname,
            profile_picture: userData.profile_picture
        }

        return NextResponse.json({ comment: newComment });
    }
    catch (error) {
        console.error("Error adding comment:", error);
        return NextResponse.json({ error: "Error adding comment" }, { status: 500 });
    }
}