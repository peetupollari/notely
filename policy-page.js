document.addEventListener("DOMContentLoaded", async () => {
  const body = document.body;
  const source = body.dataset.source;
  const policyType = body.dataset.policy;
  const statusEl = document.querySelector(".policy-status");
  const documentEl = document.querySelector(".policy-document");
  const titleEl = document.querySelector(".policy-title");
  const summaryEl = document.querySelector(".policy-summary");
  const metaEl = document.querySelector(".policy-meta");
  const sectionsEl = document.querySelector(".policy-sections");

  if (!source || !policyType || !statusEl || !documentEl || !titleEl || !summaryEl || !metaEl || !sectionsEl) {
    return;
  }

  const setError = (message) => {
    statusEl.textContent = message;
    statusEl.classList.add("is-error");
    documentEl.hidden = true;
  };

  const formatDate = (value) => {
    if (!value) return "";
    const parsed = new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return value;
    return new Intl.DateTimeFormat("en", {
      year: "numeric",
      month: "long",
      day: "numeric"
    }).format(parsed);
  };

  const makeSection = (title, fragments) => {
    const section = document.createElement("section");
    section.className = "policy-section";

    const heading = document.createElement("h2");
    heading.textContent = title;
    section.appendChild(heading);

    fragments.forEach((fragment) => {
      if (fragment) section.appendChild(fragment);
    });

    return section;
  };

  const makeParagraph = (text, className = "") => {
    const paragraph = document.createElement("p");
    if (className) paragraph.className = className;
    paragraph.textContent = text;
    return paragraph;
  };

  const makeList = (items) => {
    const list = document.createElement("ul");
    items.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      list.appendChild(li);
    });
    return list;
  };

  const makeDefinition = (pairs) => {
    const wrapper = document.createDocumentFragment();
    pairs.forEach(([label, value]) => {
      if (!value) return;
      const group = document.createElement("dl");
      group.className = "policy-key-value";

      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      dd.textContent = value;

      group.append(dt, dd);
      wrapper.appendChild(group);
    });
    return wrapper;
  };

  const makeProcessors = (items) => {
    const wrapper = document.createElement("ul");
    wrapper.className = "policy-processor-list";

    items.forEach((item) => {
      const listItem = document.createElement("li");
      const card = document.createElement("article");
      card.className = "policy-processor";

      const title = document.createElement("h3");
      title.textContent = item.name;
      const text = document.createElement("p");
      text.textContent = item.purpose;

      card.append(title, text);
      listItem.appendChild(card);
      wrapper.appendChild(listItem);
    });

    return wrapper;
  };

  const setMeta = (items) => {
    metaEl.innerHTML = "";

    items.forEach(([label, value, href]) => {
      if (!value) return;

      const itemEl = document.createElement("li");

      const strong = document.createElement("strong");
      strong.textContent = `${label}:`;
      itemEl.appendChild(strong);
      itemEl.append(" ");

      if (href) {
        const link = document.createElement("a");
        link.href = href;
        link.textContent = value;
        if (href.startsWith("http")) {
          link.target = "_blank";
          link.rel = "noreferrer";
        }
        itemEl.appendChild(link);
      } else {
        itemEl.append(document.createTextNode(value));
      }

      metaEl.appendChild(itemEl);
    });
  };

  const renderPrivacy = (data) => {
    titleEl.textContent = data.name || "Privacy Policy";
    summaryEl.textContent = data.description
      ? `${data.service || "This service"} is a ${data.description}.`
      : "This page explains what data we collect, how we use it, and what choices users have.";

    setMeta([
      ["Service", data.service, ""],
      ["Last updated", formatDate(data.last_updated), ""],
      ["Website", data.website, data.website]
    ]);

    const sections = [
      makeSection("Overview", [
        makeParagraph(
          `This policy explains how ${data.service || "the service"} handles account information, technical data, and note content.`
        )
      ]),
      makeSection("Data Controller", [
        makeDefinition([
          ["Name", data.data_controller?.name],
          ["Contact email", data.data_controller?.contact_email]
        ])
      ]),
      makeSection("What We Collect", [
        makeDefinition([
          ["Account data", (data.data_collection?.account_data || []).join(", ")],
          ["User content", data.data_collection?.user_content],
          ["Technical data", (data.data_collection?.technical_data || []).join(", ")]
        ])
      ]),
      makeSection("How We Use Data", [
        makeList(data.data_usage || [])
      ]),
      makeSection("Storage and Service Providers", [
        makeDefinition([
          ["Local storage", data.data_storage?.local_storage],
          ["Cloud storage", data.data_storage?.cloud_storage]
        ]),
        Array.isArray(data.data_storage?.third_parties) && data.data_storage.third_parties.length
          ? makeProcessors(data.data_storage.third_parties)
          : null
      ]),
      makeSection("Sharing and Retention", [
        makeParagraph(data.data_sharing || ""),
        makeParagraph(data.data_retention || "", "policy-note")
      ]),
      makeSection("Security and International Transfers", [
        makeParagraph(data.security || ""),
        makeParagraph(data.international_transfers || "", "policy-note")
      ]),
      makeSection("Policy Changes", [
        makeParagraph(data.children || ""),
        makeParagraph(data.changes || "", "policy-note")
      ]),
      makeSection("Contact", [
        makeParagraph(`Questions or requests can be sent to ${data.contact || data.data_controller?.contact_email || "our support team"}.`)
      ])
    ];

    sections.forEach((section) => sectionsEl.appendChild(section));
  };

  const renderTerms = (data) => {
    titleEl.textContent = data.name || "Terms and Conditions";
    summaryEl.textContent = data.service_description
      ? data.service_description
      : "These terms explain the rules, responsibilities, and limits that apply when using this service.";

    setMeta([
      ["Service", data.service, ""],
      ["Last updated", formatDate(data.last_updated), ""],
      ["Website", data.website, data.website]
    ]);

    const sections = [
      makeSection("Acceptance", [
        makeParagraph(data.acceptance || "")
      ]),
      makeSection("Service Description", [
        makeParagraph(data.service_description || "")
      ]),
      makeSection("Accounts", [
        makeDefinition([
          ["Requirement", data.accounts?.requirement],
          ["Responsibility", data.accounts?.responsibility]
        ])
      ]),
      makeSection("User Content", [
        makeDefinition([
          ["Ownership", data.user_content?.ownership],
          ["Responsibility", data.user_content?.responsibility],
          ["Storage", data.user_content?.storage]
        ])
      ]),
      makeSection("Acceptable Use", [
        makeList(data.acceptable_use || [])
      ]),
      makeSection("Payments", [
        makeDefinition([
          ["Processor", data.payments?.processor],
          ["Terms", data.payments?.terms],
          ["Refund policy", data.payments?.refund_policy]
        ])
      ]),
      makeSection("Service Availability", [
        makeParagraph(data.service_availability || "")
      ]),
      makeSection("Termination", [
        makeDefinition([
          ["By the user", data.termination?.by_user],
          ["By the service", data.termination?.by_service]
        ])
      ]),
      makeSection("Liability", [
        makeParagraph(data.limitation_of_liability || ""),
        makeParagraph(data.governing_law || "", "policy-note")
      ]),
      makeSection("Changes and Contact", [
        makeParagraph(data.changes || ""),
        makeParagraph(`Questions about these terms can be sent to ${data.contact || "our support team"}.`, "policy-note")
      ])
    ];

    sections.forEach((section) => sectionsEl.appendChild(section));
  };

  try {
    const response = await fetch(source, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Unable to load ${source}`);
    }

    const data = await response.json();
    sectionsEl.innerHTML = "";

    if (policyType === "privacy") {
      renderPrivacy(data);
    } else if (policyType === "terms") {
      renderTerms(data);
    } else {
      throw new Error("Unknown policy type.");
    }

    statusEl.hidden = true;
    documentEl.hidden = false;
  } catch (error) {
    setError("Could not load this policy right now. If you are opening the file directly, serve the site through a local or deployed web server so the JSON file can be fetched.");
    console.error(error);
  }
});
