import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { minimatch } from "minimatch";
import { Configuration, OpenAIApi } from "openai";

type OverwriteSettings = {
  alwaysOverwrite: boolean;
  neverOverwrite: boolean;
};

async function shouldOverwriteFile(
  filePath: string,
  settings: OverwriteSettings
): Promise<boolean> {
  if (settings.alwaysOverwrite) {
    return true;
  }

  if (settings.neverOverwrite) {
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
      settings.alwaysOverwrite = true;
      return true;
    case "Never":
      settings.neverOverwrite = true;
      return false;
    default:
      return false;
  }
}

async function replaceSelectedText(text: string) {
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    const selections = editor.selections;
    editor.edit((editBuilder) => {
      selections.forEach((selection) => {
        editBuilder.replace(selection, text);
      });
    });
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
  let fileContent: string;

  if (fs.existsSync(filePath)) {
    fileContent = fs.readFileSync(filePath, "utf-8");
  } else {
    fileContent = filePath;
  }

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
  const overwriteSettings = { alwaysOverwrite: false, neverOverwrite: false };

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

        // Check if file should be copied without processing
        const fileCopyPatterns = vscode.workspace
          .getConfiguration("chatgpt-file-processor")
          .get("fileCopyPatterns") as string[];
        const shouldCopyUnmodified = fileCopyPatterns.some((pattern) =>
          minimatch(entry.name, pattern)
        );
        if (shouldCopyUnmodified) {
          fs.mkdirSync(path.dirname(outputFilePath), { recursive: true });
          fs.copyFileSync(inputFilePath, outputFilePath);
          continue;
        }

        if (fs.existsSync(outputFilePath)) {
          const overwrite = await shouldOverwriteFile(
            outputFilePath,
            overwriteSettings
          );

          if (!overwrite) {
            continue;
          }
        }

        try {
          const processingMessage = vscode.window.setStatusBarMessage(
            `Processing file: ${inputFilePath}`
          );

          const processedContent = await processFile(
            inputFilePath,
            systemMessage,
            apiKey,
            model
          );
          processingMessage.dispose();

          fs.mkdirSync(path.dirname(outputFilePath), { recursive: true });
          fs.writeFileSync(outputFilePath, processedContent);

          vscode.window.setStatusBarMessage(
            `Finished processing file: ${inputFilePath}`,
            3000
          );

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

      let systemMessage: string | undefined;
      if (selectedPrompt === "Custom") {
        systemMessage = await vscode.window.showInputBox({
          prompt: "Enter the custom system prompt:",
        });
      } else {
        systemMessage = selectedPrompt;
      }

      if (!systemMessage || systemMessage === undefined) {
        return;
      }

      const cancellationTokenSource = new vscode.CancellationTokenSource();
      const cancellationToken = cancellationTokenSource.token;

      const progressOptions: vscode.ProgressOptions = {
        location: vscode.ProgressLocation.Notification,
        title: "Processing files with ChatGPT...",
        cancellable: true,
      };

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

      vscode.window.withProgress(progressOptions, async (progress) => {
        cancellationToken.onCancellationRequested(() => {
          cancellationTokenSource.cancel();
          console.log("File processing was cancelled.");
        });

        progress.report({ message: "Starting file processing..." });

        try {
          await processFiles(
            inputDir[0].fsPath,
            outputDir[0].fsPath + "_processed",
            fileType,
            systemMessage as string,
            apiKey,
            model,
            testRun
          );
          vscode.window.showInformationMessage("Files processed successfully.");
        } catch (error) {
          if (cancellationToken.isCancellationRequested) {
            vscode.window.showInformationMessage(
              "File processing was cancelled."
            );
          } else {
            if (error instanceof Error) {
              vscode.window.showErrorMessage(
                `An error occurred during file processing: ${error.message}`
              );
            }
          }
        }
      });
    }
  );

  context.subscriptions.push(disposable);

  let processSelectionDisposable = vscode.commands.registerCommand(
    "chatgpt-file-processor.processSelection",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const selectedText = editor.document.getText(editor.selection);

        const cancellationTokenSource = new vscode.CancellationTokenSource();
        const cancellationToken = cancellationTokenSource.token;

        const progressOptions: vscode.ProgressOptions = {
          location: vscode.ProgressLocation.Notification,
          title: "Processing selection with ChatGPT...",
          cancellable: true,
        };

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

        let systemMessage: string | undefined;
        if (selectedPrompt === "Custom") {
          systemMessage = await vscode.window.showInputBox({
            prompt: "Enter the custom system prompt:",
          });
        } else {
          systemMessage = selectedPrompt;
        }

        if (!systemMessage || systemMessage === undefined) {
          return;
        }

        const apiKey = vscode.workspace
          .getConfiguration("chatgpt-file-processor")
          .get("apiKey") as string;
        const model = vscode.workspace
          .getConfiguration("chatgpt-file-processor")
          .get("model") as string;

        vscode.window.withProgress(progressOptions, async (progress) => {
          cancellationToken.onCancellationRequested(() => {
            cancellationTokenSource.cancel();
            console.log("Selection processing was cancelled.");
          });

          progress.report({ message: "Starting selection processing..." });

          try {
            const processedText = await processFile(
              selectedText,
              systemMessage as string,
              apiKey,
              model
              // cancellationToken
            );

            if (!cancellationToken.isCancellationRequested) {
              replaceSelectedText(processedText);
              vscode.window.showInformationMessage(
                "Selection processed successfully."
              );
            } else {
              vscode.window.showInformationMessage(
                "Selection processing was cancelled."
              );
            }
          } catch (error) {
            if (cancellationToken.isCancellationRequested) {
              vscode.window.showInformationMessage(
                "Selection processing was cancelled."
              );
            } else {
              if (error instanceof Error) {
                vscode.window.showErrorMessage(
                  `An error occurred during selection processing: ${error.message}`
                );
              }
            }
          }
        });
      }
    }
  );

  context.subscriptions.push(processSelectionDisposable);

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
