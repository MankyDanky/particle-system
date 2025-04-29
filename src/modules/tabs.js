/**
 * UI Tabs functionality
 */

document.addEventListener('DOMContentLoaded', () => {
  // Get all tab buttons and content
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');
  
  // Add click event listeners to each tab button
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      // Get the tab to show from the data-tab attribute
      const tabToShow = button.getAttribute('data-tab');
      
      // Remove active class from all buttons and contents
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabContents.forEach(content => content.classList.remove('active'));
      
      // Add active class to the clicked button
      button.classList.add('active');
      
      // Show the corresponding tab content
      document.getElementById(`${tabToShow}-tab`).classList.add('active');
    });
  });
});