document.addEventListener("DOMContentLoaded", () => {
    const slides = document.querySelectorAll(".slide");
    const prevBtn = document.getElementById("prev-btn");
    const nextBtn = document.getElementById("next-btn");
    const currNum = document.getElementById("curr-num");
    
    let currentSlideIndex = 0;
    const totalSlides = slides.length;

    function showSlide(index) {
        // Deactivate old slide
        slides[currentSlideIndex].classList.remove("active-slide");
        
        // Update index bounds
        currentSlideIndex = index;
        if (currentSlideIndex < 0) currentSlideIndex = 0;
        if (currentSlideIndex >= totalSlides) currentSlideIndex = totalSlides - 1;

        // Activate new slide
        slides[currentSlideIndex].classList.add("active-slide");
        
        // Update controls UI state
        currNum.innerText = currentSlideIndex + 1;
        prevBtn.disabled = currentSlideIndex === 0;
        nextBtn.disabled = currentSlideIndex === totalSlides - 1;
    }

    function navigate(direction) {
        if (direction === "next" && currentSlideIndex < totalSlides - 1) {
            showSlide(currentSlideIndex + 1);
        } else if (direction === "prev" && currentSlideIndex > 0) {
            showSlide(currentSlideIndex - 1);
        }
    }

    // Nav Button listeners
    prevBtn.addEventListener("click", () => navigate("prev"));
    nextBtn.addEventListener("click", () => navigate("next"));

    // Keyboard navigation (Arrow keys & Spacebar)
    document.addEventListener("keydown", (e) => {
        if (e.key === "ArrowRight" || e.key === "Space" || e.key === " ") {
            e.preventDefault();
            navigate("next");
        } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            navigate("prev");
        }
    });
});
