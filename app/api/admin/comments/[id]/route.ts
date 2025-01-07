import { NextResponse } from "next/server";

import pool from "@/app/util/helpers/database";

export async function DELETE(req: Request, { params } : { params: { id: string } }) {
    try {
        const { id } = params;
        const result = await pool.query("DELETE FROM comments WHERE id = $1 RETURNING id", [id]);
        if (result.rowCount === 0) {
            return NextResponse.json({ error: "Comment not found" }, { status: 404 });
        }

        return NextResponse.json({ message: "Comment deleted successfully", id });
    }
    catch (error) {
        console.error("Error deleting comment:", error);
        return NextResponse.json({ error: "Failed to delete comment" }, { status: 500 });
    }
}