# Documentation Writing Rules

This document outlines the official guidelines for writing and structuring documentation for FreestyleJS Ani. Adhering to these rules ensures consistency, clarity, and maintainability across all our documentation.

---

## 1. Markdown Syntax (GFM)

Leverage GitHub Flavoured Markdown (GFM) to create a better reading experience.

### **Use Lists for Key Points**

Instead of complex sentences with many connectives, use unordered lists (`-`) to present key features or points. This improves scannability.

### **Use Tables for Structured Data**

Tables are essential for presenting structured information like API parameters, props, or return values. This is the required format for documenting APIs.

**Example:**

| Name           | Type             | Description                               |
| -------------- | ---------------- | ----------------------------------------- |
| `timeline`     | `Timeline<G>`    | The animation timeline instance to track. |
| `initialValue` | `AniGroup<G>`    | The initial value of the animation state. |

### **Use Headings for Structure**

-   Use headings (`##`, `###`) to break down content into logical, scannable sections.
-   Headings create anchor links, allowing for easy cross-referencing.
-   Give each step in a process a meaningful heading instead of using an ordered list.

### **Use Bold for Emphasis**

Use bold (`**text**`) to highlight important terms, concepts, or keywords. This helps readers who are skimming the content to quickly find relevant information.

### **Use Code Blocks for Examples**

-   All technical examples, API definitions, and code snippets **must** be in code blocks with the correct language identifier (e.g., `tsx`, `typescript`, `svelte`, `vue`).
-   Use comments within code blocks to explain specific lines or concepts.
-   Keep examples focused and minimal.

### **Use Hyperlinks for References**

When mentioning another component, API, or external resource (e.g., `timeline`, `React`), link to the relevant documentation page or URL.

---

## 2. Writing Style

Our documentation targets a global audience. Clarity and simplicity are paramount.

### **Use Simple, Direct Language**

-   Use simple and accurate words. Avoid jargon or overly technical terms where a simpler alternative exists.
-   Be direct. Remove redundant or polite phrases.

| Before                                       | After                                      |
| -------------------------------------------- | ------------------------------------------ |
| `You can configure the library by...`        | `Configure the library by...`              |
| `If it doesn't work, you may try to...`      | `If it doesn't work,...`                   |
| `To enable B, you can configure C`           | `To enable B, configure C`                 |

### **"Subject First" Sentence Structure**

Place the main subject at the beginning of the sentence. This makes the content easier to parse, especially for non-native English speakers.

| Before                                                              | After                                                               |
| ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `One of the core concepts of the library, the timeline, is...`      | `The timeline is a core concept of the library. It is...`           |
| `Moreover, as a web framework, Next.js is useful for React.js apps` | `Next.js is a web framework that is useful for building React.js apps` |

### **No Long Paragraphs**

-   Keep paragraphs short and focused on a single idea.
-   A paragraph should generally be no longer than 5-7 lines.
-   Break up longer explanations into multiple paragraphs, each with a clear topic.

### **Avoid Sequential Words**

Do not use words like "first," "then," or "finally" to describe steps. People read from top to bottom, so the order is implicit. Use meaningful headings for each step instead.

---

## 3. Page Content and Organization

How content is structured within a page is as important as the content itself.

### **Define Acronyms**

Spell out any acronyms or abbreviations the first time they are used on a page.

### **No Duplicated Content**

Avoid repeating the same information across multiple pages. If a concept is relevant in multiple places, explain it once on a dedicated page and link to it from the other pages. This makes maintenance easier.

### **Dedicated API Sections**

-   Every exported function, hook, or component must have a dedicated documentation page.
-   Each page must include:
    1.  A clear title and a one-sentence description.
    2.  A minimal, complete, and verifiable code example.
    3.  A "Usage & Concepts" section explaining the *why* and *how*.
    4.  An "API Reference" section with tables for parameters, props, and return values.
    5.  A "Related Components" section with links to other relevant APIs.

### **"When to Use" Sections**

For hooks or components that have alternatives (e.g., `useAni` vs. `useAniRef`), include a "When to Use" section that provides clear guidelines on which to choose in different scenarios. Use "Do" and "Don't" bullet points for clarity.

---

## 4. File and Navigation Structure

A logical file structure is crucial for discoverability and maintainability.

### **Dedicated Page per Topic**

Each core concept, API, or feature should have its own dedicated page. This ensures that information is easy to find and update.

### **No Overlapping Pages**

Avoid creating multiple pages with similar purposes. For example, "Getting Started" and "Introduction" should be combined if their content overlaps significantly.

### **Logical Learning Curve**

Order pages in the navigation (`meta.json`) to follow a logical progression. Start with introductory concepts, move to core APIs, and then cover advanced topics and framework-specific bindings.
