import tkinter as tk
from tkinter import ttk
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
import matplotlib.pyplot as plt
import threading

class DistributionSimulation:
    def __init__(self, root):
        self.root = root
        self.stop_event = threading.Event()
        self.distribution_thread = None  # Initialize distribution_thread attribute
        
        self.number_of_users = 100000
        self.distribution_amount = 1000000
        self.lucky_contribution = 550
        self.unlucky_contribution = 50
        self.user_contributions = [{"contribution": 0, "lucky": False, "finished": False, "distributionAmount": self.distribution_amount} for _ in range(self.number_of_users)]  # Initialize user_contributions
        
        self.total_lucky_users = 0
        self.remaining_users = self.number_of_users
        self.remaining_amount = 0
        self.day_counter = 0
        self.finished_users = 0
        self.setup_ui()
        
        self.days = []
        self.daily_luck_users = []
        self.total_contributions = []
        self.total_lucky_users_list = []
        self.unlucky_users = []
        self.total_lucky_distribution = []
        self.finished_users_list = []

    def setup_ui(self):
        # Set a modern theme
        self.root.style = ttk.Style()
        self.root.style.theme_use("clam")

        # Create a frame for the main content
        main_frame = ttk.Frame(self.root, padding="20")
        main_frame.pack(fill="both", expand=True)

        # Create a label for the title
        title_label = ttk.Label(main_frame, text="Distribution Simulation", font=("Helvetica", 18, "bold"))
        title_label.pack(pady=(0, 20))

        # Create an entry widget for the day counter
        day_counter_entry_label = ttk.Label(main_frame, text="Enter Day Counter", style="Label.TLabel")
        day_counter_entry_label.pack()

        self.day_counter_entry = ttk.Entry(main_frame, style="Entry.TEntry")
        self.day_counter_entry.pack(pady=(0, 10))

        # Create a button to start the distribution process
        self.start_button = ttk.Button(main_frame, text="Start Distribution", command=self.start_distribution, style="Button.TButton")
        self.start_button.pack(pady=(10, 20))

        # Create a progress bar
        self.progress_bar = ttk.Progressbar(main_frame, orient="horizontal", mode="determinate", style="Horizontal.TProgressbar")
        self.progress_bar.pack(fill="x")

        # Create a label for the distribution status message
        self.status_label = ttk.Label(main_frame, text="", style="StatusLabel.TLabel")
        self.status_label.pack(pady=10)

        # Create a label for the day counter
        self.days_label = ttk.Label(main_frame, text="", style="DaysLabel.TLabel")
        self.days_label.pack(pady=10)

        # Create checkboxes
        self.checkboxes = []
        checkbox_frame = ttk.Frame(main_frame, style="CheckboxFrame.TFrame")
        checkbox_frame.pack(pady=10)
        texts = ["Daily Lucky Users", "Total Contribution", "Total Lucky Users", "Unlucky Users", "Total Lucky Distribution", "Finished Users"]
        for text in texts:
            var = tk.BooleanVar(value=True)
            cb = ttk.Checkbutton(checkbox_frame, text=text, variable=var, style="Checkbox.TCheckbutton")
            cb.pack(side="left", padx=5)
            self.checkboxes.append(var)

        # Configure styles
        self.root.style.configure("Main.TFrame", background="#f0f0f0")
        self.root.style.configure("Title.TLabel", foreground="#333", background="#f0f0f0")
        self.root.style.configure("Label.TLabel", foreground="#333", background="#f0f0f0")
        self.root.style.configure("Entry.TEntry", foreground="#333", background="#fff", bordercolor="#ccc")
        self.root.style.configure("Button.TButton", foreground="#fff", background="#007bff", font=("Arial", 10, "bold"))
        self.root.style.configure("Button.TButton:hover", background="#0056b3")
        self.root.style.configure("Horizontal.TProgressbar", background="#ccc", troughcolor="#007bff", bordercolor="#007bff")
        self.root.style.configure("StatusLabel.TLabel", foreground="#333", background="#f0f0f0")
        self.root.style.configure("DaysLabel.TLabel", foreground="#333", background="#f0f0f0")
        self.root.style.configure("CheckboxFrame.TFrame", background="#f0f0f0")
        self.root.style.configure("Checkbox.TCheckbutton", background="#f0f0f0")
        self.root.style.map("Checkbox.TCheckbutton", background=[("active", "#f0f0f0")])
    def start_distribution(self):
        if self.distribution_thread and self.distribution_thread.is_alive():
            print("Wait for the current distribution process to finish.")
            return
        self.reset_variables()  # Reset variables before starting a new distribution

        self.update_progress(100000, 0)
        # Create a new thread for the distribution process
        self.distribution_thread = threading.Thread(target=self.distribute_daily)
        self.distribution_thread.start()
        # Disable the start button
        self.start_button.config(state="disabled")

    def distribute_daily(self):
        valid = self.validate_day_counter_input(self.day_counter_entry.get())
        # while not self.stop_event.is_set():
        while self.remaining_users > 0 and (valid or self.day_counter < int(self.day_counter_entry.get())):
             
            self.day_counter += 1
            print(f"Day: {self.day_counter}")

            # Update distribution_amount based on day_counter
            if self.day_counter >= 365 * 3:
                self.distribution_amount = 500000  # Change distribution_amount to 500,000 after 3 years
                # Update distribution_amount for users who have not been lucky yet
                for user in self.user_contributions:
                    if not user["lucky"]:
                        user["distributionAmount"] = self.distribution_amount

            if self.day_counter >= 365 * 5:
                self.distribution_amount = 250000  # Change distribution_amount to 250,000 after 5 years
                # Update distribution_amount for users who have not been lucky yet
                for user in self.user_contributions:
                    if not user["lucky"]:
                        user["distributionAmount"] = self.distribution_amount

            # Calculate the total contribution for the day
            total_contribution = (self.total_lucky_users * self.lucky_contribution) + (self.remaining_users * self.unlucky_contribution) + self.remaining_amount

            # Calculate the number of lucky users for this distribution
            current_lucky_users = total_contribution // self.distribution_amount

            # Calculate the remaining amount after distributing to lucky users
            self.remaining_amount = total_contribution % self.distribution_amount

            # Update the total number of lucky users
            self.total_lucky_users += current_lucky_users

            # Update the number of remaining users (excluding those who are already lucky)
            self.remaining_users = self.number_of_users - self.total_lucky_users

            # Adjust remaining users based on those who have already contributed the distribution amount
            self.remaining_users = max(self.remaining_users, 0)  # Ensure remaining users is not negative

            if self.total_lucky_users < len(self.user_contributions):
                for i in range(self.total_lucky_users - current_lucky_users, self.total_lucky_users):
                    self.user_contributions[i]["lucky"] = True

            # Update each user's contribution and lucky status
            for user in self.user_contributions:
                if user["finished"]:
                    continue

                if user["contribution"] < user["distributionAmount"]:
                    if not user["lucky"]:
                        user["contribution"] += self.unlucky_contribution
                    else:
                        user["contribution"] += self.lucky_contribution

                    # Check if this contribution completes the user's total distribution amount
                    if user["contribution"] >= user["distributionAmount"]:
                        user["finished"] = True
                        self.finished_users += 1

            # Update the progress bar and labels
            self.update_progress(self.remaining_users, self.day_counter)
            self.root.update()  # Update the GUI

            # Append distribution data to lists for plotting
            self.days.append(self.day_counter)
            self.daily_luck_users.append(current_lucky_users)
            self.total_contributions.append(total_contribution)
            self.total_lucky_users_list.append(self.total_lucky_users)
            self.unlucky_users.append(self.remaining_users)
            self.total_lucky_distribution.append(self.total_lucky_users * self.distribution_amount)
            self.finished_users_list.append(self.finished_users)

            # Check if the distribution process is finished
            if self.remaining_users == 0 or (valid and self.day_counter >= int(self.day_counter_entry.get())):
                # Schedule the plot_data function to be called from the main thread
                # self.root.after(0, self.plot_data, checkboxes=self.checkboxes)
                self.root.after(0, lambda: self.plot_data(checkboxes=self.checkboxes))


                # Exit the loop
                break
        print("Distribution process completed.")
        # Join the distribution thread to wait for it to finish
        self.start_button.config(state="normal")
        # Plot the data after distribution completes
        # plot_data()
    
    def plot_data(self, checkboxes):
        selected_items = [var.get() for var in checkboxes]
        num_selected = sum(selected_items)
        num_plots = min(num_selected, 6)  # Maximum of 6 subplots

        if num_plots == 0:
            print("No items selected for plotting.")
            return
        rows = (num_plots + 1) // 2  # Calculate the number of rows for subplots
        cols = 1 if num_plots == 1 else 2  # Adjust the number of columns based on whether num_plots is odd or even

        plt.figure(figsize=(12, 8))


        plot_index = 0
        for i in range(len(selected_items)):
            if selected_items[i]:
                plot_index += 1
                plt.subplot(rows, cols, plot_index)
                # Plot the corresponding data based on the index i
                if i == 0:
                    plt.bar(self.days, self.daily_luck_users)
                    plt.xlabel("Days")
                    plt.ylabel("Daily Lucky Users")
                    plt.title("Daily Lucky Users Over Time")
                elif i == 1:
                    plt.bar(self.days, self.total_contributions)
                    plt.xlabel("Days")
                    plt.ylabel("Total Contribution")
                    plt.title("Total Contribution Over Time")
                elif i == 2:
                    plt.bar(self.days, self.total_lucky_users_list)
                    plt.xlabel("Days")
                    plt.ylabel("Total Lucky Users")
                    plt.title("Total Lucky Users Over Time")
                elif i == 3:
                    plt.bar(self.days, self.unlucky_users)
                    plt.xlabel("Days")
                    plt.ylabel("Unlucky Users")
                    plt.title("Unlucky Users Over Time")
                elif i == 4:
                    plt.bar(self.days, self.total_lucky_distribution)
                    plt.xlabel("Days")
                    plt.ylabel("Total Lucky Distribution")
                    plt.title("Total Lucky Distribution Over Time")
                elif i == 5:
                    plt.bar(self.days, self.finished_users_list)
                    plt.xlabel("Days")
                    plt.ylabel("Finished Users")
                    plt.title("Finished Users Over Time")

        plt.tight_layout()
        plt.get_current_fig_manager().window.state('zoomed')  # Maximize the plot window
        plt.show()
    def reset_variables(self):
        self.stop_event.set()  # Set the stop event to stop the thread

        # Reset variables logic here
        self.day_counter = 0
        self.total_lucky_users = 0
        self.remaining_users = 100000
        self.remaining_amount = 0
        self.finished_users = 0

        # Reset distribution thread if it exists and is alive
        if self.distribution_thread and self.distribution_thread.is_alive():
            self.stop_event.set()  # Set the stop event to stop the thread
            self.distribution_thread.join()  # Wait for the thread to stop
            self.stop_event.clear()  # Clear the stop event
            self.distribution_thread = None  # Reset the thread variable

        # Reset user_contributions
        for user in self.user_contributions:
            user["contribution"] = 0
            user["lucky"] = False
            user["finished"] = False
            user["distributionAmount"] = self.distribution_amount

        # Reset lists for plotting
        self.days.clear()
        self.daily_luck_users.clear()
        self.total_contributions.clear()
        self.total_lucky_users_list.clear()
        self.unlucky_users.clear()
        self.total_lucky_distribution.clear()
        self.finished_users_list.clear()

        # Update GUI elements
        self.progress_bar['value'] = 0
        self.status_label.config(text=f"Distributing... Remaining Users: {self.remaining_users}")
        self.days_label.config(text=f"Day Counter: {self.day_counter}")

        print("Variables reset successfully.")

    def update_progress(self, remaining_users, day_counter):
        total_users = 100000  # Total number of users
        total_days = 2386  # Total number of days

        valid = self.validate_day_counter_input(self.day_counter_entry.get())
        if not valid:
            progress = (total_users - remaining_users) / total_users * 100
        else:
            progress = (day_counter) / int(self.day_counter_entry.get()) * 100

        self.progress_bar['value'] = progress
        self.status_label.config(text=f"Remaining Users: {remaining_users}")
        self.days_label.config(text=f"Day Counter: {day_counter}")

    def validate_day_counter_input(self, value):
        if value.isdigit() and int(value) > 0:
            return True
        else:
            return False

def main():
    root = tk.Tk()
    root.title("Distribution Simulation")
    app = DistributionSimulation(root)
    root.mainloop()

if __name__ == "__main__":
    main()
