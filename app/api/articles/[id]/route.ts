import { NextResponse } from "next/server";

import pool from "@/app/util/helpers/database";

export async function GET(req: Request, { params } : { params: { id: string } }) {
    try {
        const { id } = params;
        const articleResult = await pool.query(
            `SELECT articles.*, users.nickname AS author, users.profile_picture AS author_picture
            FROM articles
            JOIN users ON articles.user_id = users.id
            WHERE articles.id = $1`,
            [id]
        )

        if (articleResult.rowCount === 0) {
            return NextResponse.json({ error: "Article not found" }, { status: 404 });
        }

        const article = articleResult.rows[0];
        const commentsResult = await pool.query(`
            SELECT 
                comments.id, 
                comments.content, 
                comments.created_at, 
                users.nickname AS author, 
                users.profile_picture 
            FROM comments 
            JOIN users ON comments.user_id = users.id 
            WHERE article_id = $1 
            ORDER BY comments.created_at DESC
        `, [id])
        const comments = commentsResult.rows;

        return NextResponse.json({
            article: {
                ...article,
                author: article.author,
                author_picture: article.author_picture
            },
            comments
        })
    }
    catch (error) {
        console.error("Error fetching article details:", error);
        return NextResponse.json({ error: "Error fetching article details" }, { status: 500 });
    }
}