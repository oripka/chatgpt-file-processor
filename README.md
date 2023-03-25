Here's a sample `README.md` for the ChatGPT File Processor extension:

```markdown
# ChatGPT File Processor

ChatGPT File Processor is a Visual Studio Code extension that allows you to process a directory of files (and its subdirectories) using OpenAI's ChatGPT API.

## Features

- Iterate over a folder and its subfolders to process files of a specific type (e.g., `*.md`).
- Configure the system message used for processing each file.
- The output for each file is written to a new directory structure with the suffix `_processed`.
- Configure the API key and model via the extension configuration.
- Test run functionality to process just the first two files.
- Library of system prompts that can be kept in the configuration and be selectable.
- Option to use a custom system prompt for each run.
- Command to add a new system prompt to the library.

## Getting Started

1. Install the extension in Visual Studio Code.
2. Configure the API key, model, and file type in the extension settings.

## Usage

1. Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P` on Mac) and type "Process Files with ChatGPT", then select the command from the list.
2. Select the input directory containing the files you want to process.
3. Select the output directory where the processed files will be saved. The output files will be saved in a new directory structure with the suffix `_processed`.
4. Choose a system prompt from the library or enter a custom system prompt.

## Configuration

You can configure the extension settings through the Visual Studio Code settings:

- `chatgpt-file-processor.apiKey`: The API key for ChatGPT.
- `chatgpt-file-processor.model`: The model to use for ChatGPT (e.g., "gpt-3.5-turbo").
- `chatgpt-file-processor.fileType`: The file type to process (e.g., "*.md", "*.txt").
- `chatgpt-file-processor.testRun`: Test run option (process only the first 2 files).
- `chatgpt-file-processor.systemPrompts`: Library of system prompts.

## Commands

- `Process Files with ChatGPT`: Process a directory of files with ChatGPT.
- `Add System Prompt to Library`: Add a new system prompt to the library.

## Contributing

If you want to contribute to this project or report a bug, please open an issue or submit a pull request on the [GitHub repository](https://github.com/oripka/chatgpt-file-processor).

## License

This extension is licensed under the [MIT License](https://opensource.org/licenses/MIT).
```

Replace the sample GitHub repository URL with the actual URL of your repository. You can customize the `README.md` further according to your requirements. Add this file to your extension's root directory, and it will be displayed as the extension's description in the Visual Studio Code marketplace.