/// <reference types="astro/client" />

/**
 * WebMCP, deklarative API (W3C-Entwurf, Chrome-Origin-Trial ab 149). Astros JSX-Typen
 * kennen die Attribute noch nicht; ohne diese Erweiterung meldet `astro check` ts(2322).
 * Genutzt von ContactForm `agentTool`, geprüft von ai-discovery `checkWebMcpForms`.
 * `toolautosubmit` fehlt hier absichtlich: abschicken muss der Mensch.
 */
declare namespace astroHTML.JSX {
  interface FormHTMLAttributes {
    toolname?: string | undefined | null;
    tooldescription?: string | undefined | null;
  }
  interface InputHTMLAttributes {
    toolparamdescription?: string | undefined | null;
  }
  interface TextareaHTMLAttributes {
    toolparamdescription?: string | undefined | null;
  }
  interface SelectHTMLAttributes {
    toolparamdescription?: string | undefined | null;
  }
}

interface Window {
  plausible?: (
    event: string,
    options?: { props?: Record<string, string | number | boolean> }
  ) => void;
}
