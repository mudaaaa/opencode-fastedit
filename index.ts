import { type Plugin, tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";
import { createTwoFilesPatch } from "diff";

function normalizeLineEndings(text: string): string {
  return text.replaceAll("\r\n", "\n");
}

function extractDefinedNames(code: string): string[] {
  const names: string[] = [];
  
  const functionMatch = code.matchAll(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)/gm);
  for (const match of functionMatch) {
    names.push(match[1]);
  }
  const classMatch = code.matchAll(/^(?:export\s+)?class\s+(\w+)/gm);
  for (const match of classMatch) {
    names.push(match[1]);
  }
  const constMatch = code.matchAll(/^(?:export\s+)?const\s+(\w+)\s*=/gm);
  for (const match of constMatch) {
    names.push(match[1]);
  }
  
  const pythonDefMatch = code.matchAll(/^def\s+(\w+)/gm);
  for (const match of pythonDefMatch) {
    names.push(match[1]);
  }
  const pythonClassMatch = code.matchAll(/^class\s+(\w+)/gm);
  for (const match of pythonClassMatch) {
    names.push(match[1]);
  }
  
  const csharpMethodMatch = code.matchAll(/^(?:public|private|protected|internal|static|async)?\s*(?:void|int|string|bool|var|\w+)\s+(\w+)\s*\(/gm);
  for (const match of csharpMethodMatch) {
    names.push(match[1]);
  }
  const csharpClassMatch = code.matchAll(/^(?:public|private|protected|internal)?\s*class\s+(\w+)/gm);
  for (const match of csharpClassMatch) {
    names.push(match[1]);
  }
  
  return names;
}

function detectFormattingIssues(beforeLines: string[], afterLines: string[], newCode: string, insertionLine: number): string[] {
  const issues: string[] = [];
  
  const beforeNonEmpty = beforeLines.filter(l => l.trim().length > 0);
  const afterNonEmpty = afterLines.filter(l => l.trim().length > 0);
  const newCodeNonEmpty = newCode.split("\n").filter(l => l.trim().length > 0);
  
  if (beforeNonEmpty.length > 0 && newCodeNonEmpty.length > 0) {
    const lastBefore = beforeNonEmpty[beforeNonEmpty.length - 1].trim();
    const firstNew = newCodeNonEmpty[0].trim();
    if (lastBefore.endsWith("{") && !firstNew.startsWith("}")) {
    } else if (!lastBefore.endsWith("{") && !lastBefore.endsWith(":") && 
               !lastBefore.endsWith("(") && !lastBefore.endsWith(",") &&
               !firstNew.startsWith("#") && !firstNew.startsWith("//") &&
               firstNew.length > 0 && !firstNew.startsWith("}")) {
      const lastBeforeLine = beforeLines[beforeLines.length - 1];
      if (lastBeforeLine.trim().length > 0) {
      }
    }
  }
  
  if (afterNonEmpty.length > 0 && newCodeNonEmpty.length > 0) {
    const lastNew = newCodeNonEmpty[newCodeNonEmpty.length - 1].trim();
    const firstAfter = afterNonEmpty[0].trim();
    if (!lastNew.endsWith("{") && !lastNew.endsWith("}") && 
        !lastNew.endsWith(":") && !lastNew.endsWith(";") &&
        !lastNew.endsWith("...") && !firstAfter.startsWith("}") &&
        firstAfter.length > 0 && !firstAfter.startsWith("#") && 
        !firstAfter.startsWith("//")) {
      const firstAfterLine = afterLines[0];
      if (firstAfterLine.trim().length > 0 && 
          (firstAfterLine.trim().startsWith("def ") || firstAfterLine.trim().startsWith("class "))) {
        issues.push(`Missing blank line before function/class at line ${insertionLine + 1}`);
      }
    }
  }
  
  return issues;
}

const FastEditPlugin: Plugin = async ({ directory, client }) => {
  return {
    tool: {
      fastedit: tool({
        description: `Replace or delete lines by line number (1-indexed, inclusive).

ARGUMENTS:
- start_line: First line to replace (1 = first line of file)
- end_line: Last line to replace (must be >= start_line)
- new_code: Code to insert. If empty string "", the range is deleted.

BEHAVIOR:
- Lines start_line through end_line are DELETED (both inclusive)
- new_code is inserted at the start_line position
- All lines AFTER end_line remain unchanged
- Use end_line = start_line - 1 to INSERT before a line (shifts content down)

EXAMPLES:
- Replace lines 5-10: start_line=5, end_line=10, new_code="x"
- Delete lines 5-10: start_line=5, end_line=10, new_code=""
- Insert BEFORE line 5: start_line=5, end_line=4, new_code="new content"

SAFETY FEATURES:
- Shows 3 context lines before/after the edit
- Warns if duplicate function/class names detected after insertion
- Warns if missing blank line before function/class

OUTPUT: Diff + context + warnings`,
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
              `start_line (${start_line}) exceeds file length (${lines.length} lines). Valid range: 1-${lines.length}.`
            )
          }

          if (end_line > lines.length) {
            throw new Error(
              `end_line (${end_line}) exceeds file length (${lines.length} lines). Valid range: 1-${lines.length}.`
            )
          }

          const beforeLines = lines.slice(0, start_line - 1)
          const afterLines = lines.slice(end_line)

          const newCodeNames = extractDefinedNames(new_code)
          const afterCodeNames = extractDefinedNames(afterLines.join("\n"))
          const warnings: string[] = []
          
          for (const name of newCodeNames) {
            if (afterCodeNames.includes(name)) {
              warnings.push(`Duplicate definition '${name}' found after insertion - may cause conflicts`);
            }
          }

          const formattingIssues = detectFormattingIssues(beforeLines, afterLines, new_code, start_line)
          
          const contextBefore = beforeLines.slice(-3)
          const contextAfter = afterLines.slice(0, 3)
          const contextNote = `

CONTEXT (3 lines before):
${contextBefore.map(l => l || "(empty)").join("\n")}

CONTEXT (3 lines after):
${contextAfter.map(l => l || "(empty)").join("\n")}`

          const contentNew = normalizeLineEndings([...beforeLines, new_code, ...afterLines].join("\n"))

          const diff = createTwoFilesPatch(resolvedPath, resolvedPath, contentOld, contentNew)

          fs.writeFileSync(resolvedPath, contentNew, "utf-8")

          context.metadata({
            title: path.basename(resolvedPath),
            metadata: {
              diff: diff,
            },
          })

          const deletedCount = end_line - start_line + 1
          const insertedLines = new_code ? new_code.split("\n").length : 0
          const added = insertedLines
          const removed = deletedCount

          let warningNote = ""
          if (warnings.length > 0) {
            warningNote = `\n⚠️ WARNINGS:\n${warnings.map(w => `- ${w}`).join("\n")}\n`
          }
          
          let formatNote = ""
          if (formattingIssues.length > 0) {
            formatNote = `\n📝 FORMATTING:\n${formattingIssues.map(f => `- ${f}`).join("\n")}\n`
          }

          return `FastEdit applied to ${resolvedPath}

+${added} -${removed} lines${warningNote}${formatNote}
${contextNote}

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
