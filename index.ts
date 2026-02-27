import { type Plugin, tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";
import { createTwoFilesPatch } from "diff";

function normalizeLineEndings(text: string): string {
  return text.replaceAll("\r\n", "\n");
}

const FastEditPlugin: Plugin = async ({ directory, client }) => {
  return {
    tool: {
      fastedit: tool({
        description: `Replace a range of lines in a file with new code without needing to specify the old content.

This tool efficiently replaces or deletes lines by line number instead of requiring you to type out the exact text being replaced. This is useful when:
- You want to replace multiple lines at once
- The old code is long and tedious to type
- You know the line numbers you want to modify

BEHAVIOR:
- Deletes all lines from start_line to end_line (inclusive)
- Inserts new_code at the start_line position
- If new_code is an empty string, the lines are simply deleted (pure deletion)
- If new_code contains multiple lines, they are all inserted starting at start_line

LINE NUMBERING:
- Uses 1-indexed line numbers (line 1 is the first line of the file)
- This matches the line numbers shown by the "view" tool

EXAMPLES:
- To replace lines 5-10 with new code: start_line=5, end_line=10, new_code="..."
- To delete lines 5-10: start_line=5, end_line=10, new_code=""
- To insert new code at line 5 (pushing existing line 5 and beyond down): use end_line=4 to "replace" a zero-length range

RETURN VALUE:
- Returns a success message with the file path and line range that was modified`,
        args: {
          file_path: tool.schema.string().describe("The absolute path to the file to modify"),
          start_line: tool.schema
            .number()
            .min(1)
            .describe("The starting line number (1-indexed) of the range to replace. Line 1 is the first line of the file."),
          end_line: tool.schema
            .number()
            .min(1)
            .describe("The ending line number (inclusive) of the range to replace. Must be >= start_line."),
          new_code: tool.schema
            .string()
            .describe("The new code to insert at the start_line position. Can be empty string to simply delete the line range."),
        },
        async execute(args, context) {
          const { file_path, start_line, end_line, new_code } = args;

          const resolvedPath = path.isAbsolute(file_path) 
            ? file_path 
            : path.join(context.worktree, file_path)

          if (!fs.existsSync(resolvedPath)) {
            throw new Error(`File does not exist: ${resolvedPath}`)
          }

          const stat = fs.statSync(resolvedPath)
          if (stat.isDirectory()) {
            throw new Error(`Path is a directory, not a file: ${resolvedPath}`)
          }

          if (start_line > end_line) {
            throw new Error(`start_line (${start_line}) must be <= end_line (${end_line})`)
          }

          const contentOld = normalizeLineEndings(fs.readFileSync(resolvedPath, "utf-8"))
          const lines = contentOld.split("\n")

          if (start_line > lines.length) {
            throw new Error(
              `start_line (${start_line}) exceeds file length (${lines.length} lines). Maximum valid line number is ${lines.length}.`
            )
          }

          if (end_line > lines.length) {
            throw new Error(
              `end_line (${end_line}) exceeds file length (${lines.length} lines). Maximum valid line number is ${lines.length}.`
            )
          }

          const beforeLines = lines.slice(0, start_line - 1)
          const afterLines = lines.slice(end_line)

          const contentNew = normalizeLineEndings([...beforeLines, new_code, ...afterLines].join("\n"))

          const diff = createTwoFilesPatch(resolvedPath, resolvedPath, contentOld, contentNew)

          fs.writeFileSync(resolvedPath, contentNew, "utf-8")

          const deletedCount = end_line - start_line + 1
          const insertedLines = new_code ? new_code.split("\n").length : 0
          const added = insertedLines
          const removed = deletedCount

          return `FastEdit applied to ${resolvedPath}

+${added} -${removed} lines

\`\`\`diff
${diff}
\`\`\``
        },
      }),
    },

    "tool.execute.after": async (input, output) => {
      if (input.tool === "fastedit") {
        const fileMatch = output.output.match(/FastEdit applied to (.+?)\n/);
        const statsMatch = output.output.match(/\+(\d+) -(\d+) lines/);

        if (fileMatch && statsMatch) {
          output.title = `FastEdit: ${path.basename(fileMatch[1])} +${statsMatch[1]}/-${statsMatch[2]}`;
        }

        output.metadata = {
          ...output.metadata,
          provider: "fastedit",
        };
      }
    },
  };
};

export default FastEditPlugin;
