# app.py
import os
from datetime import datetime, timezone
from flask import Flask, render_template, redirect, url_for, request, flash, session, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, current_user, login_user, login_required
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import load_dotenv
import requests
from flask_login import logout_user, login_required
from dotenv import load_dotenv

load_dotenv()
FINNHUB_API_KEY = os.getenv("FINNHUB_API_KEY")
BASE_URL = "https://finnhub.io/api/v1"

app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('FLASK_SECRET_KEY', 'dev-secret-key-change-in-production')
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DB_URL', 'sqlite:///stock_sim.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)
login_manager = LoginManager(app)
login_manager.login_view = 'login'

# Database Models
class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(128))
    cash = db.Column(db.Float, default=10000.00)  # Starting cash
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    
    transactions = db.relationship('Transaction', backref='user', lazy=True)
    portfolio = db.relationship('Portfolio', backref='user', lazy=True)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

class Portfolio(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    symbol = db.Column(db.String(10), nullable=False)
    quantity = db.Column(db.Integer, nullable=False)
    average_price = db.Column(db.Float, nullable=False)
    last_updated = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

class Transaction(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    last_updated = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    symbol = db.Column(db.String(10), nullable=False)
    quantity = db.Column(db.Integer, nullable=False)
    price = db.Column(db.Float, nullable=False)
    type = db.Column(db.String(4), nullable=False)  # 'buy' or 'sell'
    timestamp = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

# Flask-Login user loader
@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))


# Homepage route
@app.route('/')
def index():
    if current_user.is_authenticated:
        return redirect(url_for('portfolio'))
    return render_template('index.html')
@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('portfolio'))
    
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        user = User.query.filter_by(username=username).first()
        
        if user and user.check_password(password):
            login_user(user)
            next_page = request.args.get('next')
            return redirect(next_page or url_for('portfolio'))
        else:
            flash('Invalid username or password', 'danger')
    
    return render_template('login.html')
@app.route('/register', methods=['GET', 'POST'])
def register():
    if current_user.is_authenticated:
        return redirect(url_for('portfolio'))
    
    if request.method == 'POST':
        username = request.form.get('username')
        email = request.form.get('email')
        password = request.form.get('password')
        confirm_password = request.form.get('confirm_password')
        
        if password != confirm_password:
            flash('Passwords do not match', 'danger')
            return render_template('auth_register.html')
        
        if User.query.filter_by(username=username).first():
            flash('Username already exists', 'danger')
            return render_template('auth_register.html')
        
        if User.query.filter_by(email=email).first():
            flash('Email already exists', 'danger')
            return render_template('auth_register.html')
        
        user = User(username=username, email=email)
        user.set_password(password)
        db.session.add(user)
        db.session.commit()
        
        flash('Registration successful. Please log in.', 'success')
        return redirect(url_for('login'))
    
    return render_template('register.html')



def get_stock_price(symbol):
        try:
            url = f"{BASE_URL}/quote?symbol={symbol}&token={FINNHUB_API_KEY}"
            response = requests.get(url)
            data = response.json()
            return data.get("c", None)  # "c" is current price
        except Exception:
            return None
@app.route('/portfolio')
@login_required
def portfolio():
    # First login check
    first_login = False
    if 'first_login' not in session:
        session['first_login'] = True
        first_login = True
    
    holdings = Portfolio.query.filter_by(user_id=current_user.id).all()
    
    portfolio_data = []
    total_value = current_user.cash
    total_investment = 0
    
    labels = []
    investment_data = []
    market_value_data = []
    
    for holding in holdings:
        current_price = get_stock_price(holding.symbol)
        if current_price:
            market_value = current_price * holding.quantity
            total_value += market_value
            investment = holding.average_price * holding.quantity
            total_investment += investment
            profit_loss = market_value - investment
            profit_loss_percent = (profit_loss / investment) * 100 if investment > 0 else 0
            
            portfolio_data.append({
                'symbol': holding.symbol,
                'quantity': holding.quantity,
                'average_price': round(holding.average_price, 2),
                'current_price': round(current_price, 2),
                'market_value': round(market_value, 2),
                'investment': round(investment, 2),
                'profit_loss': round(profit_loss, 2),
                'profit_loss_percent': round(profit_loss_percent, 2)
            })
            
            # chart data
            labels.append(holding.symbol)
            investment_data.append(round(investment, 2))
            market_value_data.append(round(market_value, 2))
    
    return render_template(
        'portfolio.html', 
        portfolio=portfolio_data, 
        cash=round(current_user.cash, 2),
        total_value=round(total_value, 2),
        total_investment=round(total_investment, 2),
        first_login=first_login,
        labels=labels,
        investment_data=investment_data,
        market_value_data=market_value_data
    )

@app.route("/api/stocks")
@login_required
def get_stocks():
    try:
        # Example: Fetch top US stocks (Apple, Tesla, etc.)
        symbols = ["AAPL", "TSLA", "MSFT", "AMZN", "GOOGL","NVDA","META","JPM","V","UNH"]

        stock_data = []
        for symbol in symbols:
            quote_url = f"{BASE_URL}/quote?symbol={symbol}&token={FINNHUB_API_KEY}"
            res = requests.get(quote_url).json()

            stock_data.append({
                "symbol": symbol,
                "current_price": res.get("c", 0),   # current price
                "high": res.get("h", 0),
                "low": res.get("l", 0),
                "open": res.get("o", 0),
                "prev_close": res.get("pc", 0)
            })

        return jsonify(stock_data)

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/buy", methods=["POST"])
@login_required
def buy_stock():
    data = request.json
    symbol = data.get("symbol")
    quantity = int(data.get("quantity", 0))
    price = float(data.get("price", 0))

    if not symbol or quantity <= 0:
        return jsonify({"error": "Invalid data"}), 400

    investment = price * quantity

    # check if user has enough cash
    if current_user.cash < investment:
        return jsonify({"error": "Insufficient balance"}), 400

    # Deduct from user's cash
    current_user.cash -= investment

    # Check if user already holds this stock
    holding = Portfolio.query.filter_by(user_id=current_user.id, symbol=symbol).first()
    if holding:
        # Update average price if already holding
        total_quantity = holding.quantity + quantity
        holding.average_price = ((holding.average_price * holding.quantity) + (price * quantity)) / total_quantity
        holding.quantity = total_quantity
    else:
        # Create new holding
        holding = Portfolio(
            user_id=current_user.id,
            symbol=symbol,
            quantity=quantity,
            average_price=price
        )
        db.session.add(holding)
    db.session.commit()

    return jsonify({
        "message": f"Bought {quantity} shares of {symbol} at ${price}",
        "remaining_cash": round(current_user.cash, 2)
    })

@app.route("/buy")
@login_required
def buy_page():
    return render_template("buy.html",cash=round(current_user.cash, 2))

@app.route('/sell')
@login_required
def sell_page():
    # Get user's portfolio
    portfolio = Portfolio.query.filter_by(user_id=current_user.id).all()
    
    # Initialize variables
    total_investment = 0
    portfolio_value = 0
    cash_balance = current_user.cash  # Using 'cash' from your User model
    
    # Update current prices and calculate values
    updated_portfolio = []
    for stock in portfolio:
        try:
            # Fetch stock data from Finnhub
            url = f"{BASE_URL}/quote?symbol={stock.symbol}&token={FINNHUB_API_KEY}"
            res = requests.get(url).json()
            
            current_price = res.get("c", stock.average_price)    # Current price
            high = res.get("h", current_price)                  # High of the day
            low = res.get("l", current_price)                   # Low of the day
            open_price = res.get("o", current_price)            # Open price
            prev_close = res.get("pc", current_price)           # Previous close
            
            # Calculate portfolio values
            market_value = round(stock.quantity * current_price, 2)
            investment = round(stock.quantity * stock.average_price, 2)
            profit_loss = round(market_value - investment, 2)
            profit_loss_percent = round((profit_loss / investment) * 100, 2) if investment > 0 else 0
            
            # Append to updated portfolio
            updated_portfolio.append({
                'symbol': stock.symbol,
                'quantity': stock.quantity,
                'average_price': stock.average_price,
                'current_price': current_price,
                'investment': investment,
                'market_value': market_value,
                'profit_loss': profit_loss,
                'profit_loss_percent': profit_loss_percent,
                'high': high,
                'low': low,
                'open': open_price,
                'prev_close': prev_close
            })
            
            # Update totals
            total_investment += investment
            portfolio_value += market_value
            
        except Exception as e:
            print(f"Error fetching data for {stock.symbol}: {e}")
            # Fallback values if API fails
            market_value = round(stock.quantity * stock.average_price, 2)
            investment = round(stock.quantity * stock.average_price, 2)
            profit_loss = round(market_value - investment, 2)
            profit_loss_percent = round((profit_loss / investment) * 100, 2) if investment > 0 else 0
            
            updated_portfolio.append({
                'symbol': stock.symbol,
                'quantity': stock.quantity,
                'average_price': stock.average_price,
                'current_price': stock.average_price,
                'investment': investment,
                'market_value': market_value,
                'profit_loss': profit_loss,
                'profit_loss_percent': profit_loss_percent,
                'high': stock.average_price * 1.05,
                'low': stock.average_price * 0.95,
                'open': stock.average_price,
                'prev_close': stock.average_price
            })
            
            # Update totals with fallback
            total_investment += investment
            portfolio_value += market_value
    
    # Calculate total profit/loss
    total_pl = portfolio_value - total_investment
    total_pl_percent = (total_pl / total_investment * 100) if total_investment > 0 else 0
    
    # Render the sell page with all required variables
    return render_template('sell.html',
                           portfolio=updated_portfolio,
                           cash_balance=cash_balance,
                           total_investment=round(total_investment, 2),
                           portfolio_value=round(portfolio_value, 2),
                           total_pl=round(total_pl, 2),
                           total_pl_percent=round(total_pl_percent, 2))


@app.route('/sell_stock', methods=['POST'])
@login_required
def sell_stock():
    try:
        data = request.get_json()
        symbol = data.get('symbol').upper()
        quantity = int(data.get('quantity'))
        sell_price = float(data.get('price'))
        
        # Get user's portfolio entry for this stock
        portfolio = Portfolio.query.filter_by(user_id=current_user.id, symbol=symbol).first()
        
        if not portfolio:
            return jsonify({'error': 'You do not own this stock'}), 400
            
        if quantity > portfolio.quantity:
            return jsonify({'error': 'You do not own enough shares'}), 400
        
        # Calculate total value of sale
        total_sale = quantity * sell_price
        
        # Calculate profit/loss
        total_cost = quantity * portfolio.average_price
        profit_loss = total_sale - total_cost
        
        # Update user's cash balance (using 'cash' field from your User model)
        current_user.cash += total_sale
        db.session.commit()
        
        # Update or remove portfolio entry
        if quantity == portfolio.quantity:
            # Remove the stock entirely if selling all shares
            db.session.delete(portfolio)
        else:
            # Update quantity (average_price remains the same for remaining shares)
            portfolio.quantity -= quantity
            portfolio.last_updated = datetime.now(timezone.utc)
        
        # Record the transaction (using your Transaction model fields)
        transaction = Transaction(
            user_id=current_user.id,
            symbol=symbol,
            quantity=quantity,
            price=sell_price,
            type='sell',  # Using 'type' field from your Transaction model
            timestamp=datetime.now(timezone.utc),
            last_updated=datetime.now(timezone.utc)
        )
        db.session.add(transaction)
        db.session.commit()
        
        return jsonify({
            'message': 'Stock sold successfully', 
            'profit_loss': profit_loss,
            'new_cash_balance': current_user.cash
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500























@app.route('/learn')
@login_required
def learn_page():
    return render_template('learn.html')






@app.route("/logout")
@login_required

def logout():
    logout_user()  # ye current_user ko logout karega
    return redirect(url_for("index"))  # index() route ko call karega
with app.app_context():
    db.create_all()

def create_tables():
    db.create_all()

if __name__ == '__main__':
    app.run(debug=True)
