import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { Configuration, OpenAIApi } from "openai";

async function shouldOverwriteFile(
  filePath: string,
  alwaysOverwrite: boolean,
  neverOverwrite: boolean
): Promise<boolean> {
  if (alwaysOverwrite) {
    return true;
  }

  if (neverOverwrite) {
    return false;
  }

  const overwriteOptions = ["Yes", "No", "Always", "Never"];
  const result = await vscode.window.showInformationMessage(
    `File ${filePath} already exists. Overwrite?`,
    ...overwriteOptions
  );

  switch (result) {
    case "Yes":
      return true;
    case "No":
      return false;
    case "Always":
      alwaysOverwrite = true;
      return true;
    case "Never":
      neverOverwrite = true;
      return false;
    default:
      return false;
  }
}

async function addSystemPrompt(prompt: string) {
  const systemPrompts = vscode.workspace
    .getConfiguration("chatgpt-file-processor")
    .get("systemPrompts") as string[];
  systemPrompts.push(prompt);
  await vscode.workspace
    .getConfiguration("chatgpt-file-processor")
    .update("systemPrompts", systemPrompts, vscode.ConfigurationTarget.Global);
}

async function processFile(
  filePath: string,
  systemMessage: string,
  apiKey: string,
  model: string
): Promise<string> {
  const fileContent = fs.readFileSync(filePath, "utf-8");

  const configuration = new Configuration({
    apiKey: apiKey,
  });
  const openaiApi = new OpenAIApi(configuration);

  console.log("Processing: " + filePath);
  const completion = await openaiApi.createChatCompletion({
    model: model,
    messages: [
      { role: "system", content: systemMessage },
      { role: "user", content: fileContent },
    ],
  });

  console.log("Output: " + completion);
  if (!completion?.data?.choices[0]?.message?.content) {
    throw new Error(`Empty response for file: ${filePath}`);
  }

  return completion.data.choices[0].message.content;
}

async function processFiles(
  inputDir: string,
  outputDir: string,
  fileType: string,
  systemMessage: string,
  apiKey: string,
  model: string,
  testRun: boolean
) {
  let filesProcessed = 0;
  let alwaysOverwrite = false;
  let neverOverwrite = false;

  async function processDirectory(inputPath: string, outputPath: string) {
    const entries = fs.readdirSync(inputPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        await processDirectory(
          path.join(inputPath, entry.name),
          path.join(outputPath, entry.name)
        );
      } else if (entry.isFile() && entry.name.endsWith(fileType)) {
        const inputFilePath = path.join(inputPath, entry.name);
        const outputFilePath = path.join(outputPath, entry.name);

        if (fs.existsSync(outputFilePath)) {
          const overwrite = await shouldOverwriteFile(
            outputFilePath,
            alwaysOverwrite,
            neverOverwrite
          );

          if (!overwrite) {
            continue;
          }

          if (alwaysOverwrite) {
            neverOverwrite = false;
          }

          if (neverOverwrite) {
            alwaysOverwrite = false;
          }
        }

        try {
          const processedContent = await processFile(
            inputFilePath,
            systemMessage,
            apiKey,
            model
          );

          fs.mkdirSync(path.dirname(outputFilePath), { recursive: true });
          fs.writeFileSync(outputFilePath, processedContent);

          filesProcessed++;
          if (testRun && filesProcessed >= 2) {
            break;
          }
        } catch (error: unknown) {
          if (error instanceof Error) {
            vscode.window.showErrorMessage(
              `Error processing file ${inputFilePath}: ${error.message}`
            );
          } else {
            vscode.window.showErrorMessage(
              `Error processing file ${inputFilePath}: ${String(error)}`
            );
          }
        }
      }
    }
  }

  await processDirectory(inputDir, outputDir);
}

export function activate(context: vscode.ExtensionContext) {
  let disposable = vscode.commands.registerCommand(
    "chatgpt-file-processor.processFiles",
    async () => {
      const inputDir = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: "Select input directory",
      });

      if (!inputDir) {
        return;
      }

      const outputDir = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: "Select output directory",
      });

      if (!outputDir) {
        return;
      }

      const systemPrompts = vscode.workspace
        .getConfiguration("chatgpt-file-processor")
        .get("systemPrompts") as string[];

      const selectedPrompt = await vscode.window.showQuickPick(
        [...systemPrompts, "Custom"],
        {
          placeHolder:
            "Select a system prompt from the library or choose Custom to enter a new one",
        }
      );

      let systemMessage;
      if (selectedPrompt === "Custom") {
        systemMessage = await vscode.window.showInputBox({
          prompt: "Enter the custom system prompt:",
        });
      } else {
        systemMessage = selectedPrompt;
      }

      if (!systemMessage) {
        return;
      }

      const fileType = vscode.workspace
        .getConfiguration("chatgpt-file-processor")
        .get("fileType") as string;
      const apiKey = vscode.workspace
        .getConfiguration("chatgpt-file-processor")
        .get("apiKey") as string;
      const model = vscode.workspace
        .getConfiguration("chatgpt-file-processor")
        .get("model") as string;
      const testRun = vscode.workspace
        .getConfiguration("chatgpt-file-processor")
        .get("testRun") as boolean;

      await processFiles(
        inputDir[0].fsPath,
        outputDir[0].fsPath + "_processed",
        fileType,
        systemMessage,
        apiKey,
        model,
        testRun
      );
      vscode.window.showInformationMessage("Files processed successfully.");
    }
  );

  context.subscriptions.push(disposable);

  let addPromptDisposable = vscode.commands.registerCommand(
    "chatgpt-file-processor.addSystemPrompt",
    async () => {
      const newPrompt = await vscode.window.showInputBox({
        prompt: "Enter the new system prompt:",
      });

      if (newPrompt) {
        await addSystemPrompt(newPrompt);
        vscode.window.showInformationMessage(
          "System prompt added to the library."
        );
      }
    }
  );

  context.subscriptions.push(addPromptDisposable);
}

export function deactivate() {}
