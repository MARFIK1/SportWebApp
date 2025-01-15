import { NextResponse } from "next/server";

import pool from "@/app/util/helpers/database";

export async function GET(req: Request) {
    try {
        const userId = req.headers.get("cookie")?.split("; ").find((c) => c.startsWith("user="))?.split("=")[1];
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        const articles = await pool.query(`
            SELECT 
                id, 
                title, 
                status, 
                created_at, 
                updated_at 
            FROM articles 
            WHERE user_id = $1
        `, [userId])

        const comments = await pool.query(`
            SELECT 
                comments.id, 
                comments.content, 
                comments.created_at, 
                comments.updated_at, 
                comments.article_id, 
                articles.title AS article_title
            FROM comments
            LEFT JOIN articles ON comments.article_id = articles.id
            WHERE comments.user_id = $1
            ORDER BY comments.created_at DESC
        `, [userId])

        return NextResponse.json({
            articles: articles.rows,
            comments: comments.rows,
            totalArticles: articles.rowCount,
            totalComments: comments.rowCount
        })
    }
    catch (error) {
        console.error("Error fetching user activity:", error);
        return NextResponse.json({ error: "Error fetching user activity" }, { status: 500 });
    }
}