const forgeButton = document.querySelector("#forge-button");
const status = document.querySelector("#status");

forgeButton?.addEventListener("click", () => {
  status.textContent = "Clawforge is awake.";
});

