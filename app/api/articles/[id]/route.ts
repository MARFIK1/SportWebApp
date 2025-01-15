import { NextResponse } from "next/server";

import pool from "@/app/util/helpers/database";

export async function GET(req: Request, { params } : { params: { id: string } }) {
    try {
        const { id } = params;
        if (!id || id === "undefined") {
            return NextResponse.json({ error: "Invalid article ID" }, { status: 400 });
        }

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
                comments.updated_at, 
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
                author_picture: article.author_picture,
            },
            comments,
        })
    }
    catch (error) {
        console.error("Error fetching article details:", error);
        return NextResponse.json({ error: "Error fetching article details" }, { status: 500 });
    }
}

export async function PATCH(req: Request, { params } : { params: { id: string } }) {
    try {
        const { id } = params;
        if (!id || id === "undefined") {
            return NextResponse.json({ error: "Invalid article ID" }, { status: 400 });
        }

        const formData = await req.formData();
        const title = formData.get("title") as string;
        const content = formData.get("content") as string;
        const tags = (formData.get("tags") as string).split(",").map(tag => tag.trim());
        const image = formData.has("image") ? formData.get("image") : null;
        if (!title || !content) {
            return NextResponse.json({ error: "Title and content are required" }, { status: 400 });
        }

        const statusResult = await pool.query(`SELECT status FROM articles WHERE id = $1`, [id]);
        if (statusResult.rowCount === 0) {
            return NextResponse.json({ error: "Article not found" }, { status: 404 });
        }

        const currentStatus = statusResult.rows[0].status;
        const newStatus = currentStatus !== "pending" ? "pending" : currentStatus;
        const query = `
            UPDATE articles
            SET 
                title = $1, 
                content = $2, 
                tags = $3, 
                image = COALESCE($4, image),
                status = $5,
                updated_at = NOW()
            WHERE id = $6
            RETURNING *;
        `;
        const values = [title, content, tags, image, newStatus, id];
        const result = await pool.query(query, values);
        if (result.rowCount === 0) {
            return NextResponse.json({ error: "Article not found or not updated" }, { status: 404 });
        }

        return NextResponse.json({ 
            message: "Article updated successfully", 
            article: result.rows[0] 
        })
    }
    catch (error) {
        console.error("Error updating article:", error);
        return NextResponse.json({ error: "Error updating article" }, { status: 500 });
    }
}