// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20Minimal {
    function balanceOf(address account) external view returns (uint256);
}

contract ManagedTokenDistributor {
    bytes4 private constant TRANSFER_SELECTOR = bytes4(keccak256("transfer(address,uint256)"));

    address public immutable tokenOut;
    uint256 public immutable amount;
    address public immutable recipient;
    address public immutable owner;
    address public immutable returnWallet;
    bool public executed;

    event Executed(address indexed token, uint256 amount, address indexed recipient);
    event ExcessReturned(address indexed token, uint256 amount, address indexed to);
    event TokensRescued(address indexed token, uint256 amount, address indexed to);

    error OnlyOwner();
    error AlreadyExecuted();
    error TransferFailed();
    error NativeTransferFailed();
    error InsufficientBalance(uint256 available, uint256 required);

    constructor(
        address _tokenOut,
        uint256 _amount,
        address _recipient,
        address _owner,
        address _returnWallet
    ) {
        require(_amount > 0, "Amount must be greater than 0");
        require(_recipient != address(0), "Invalid recipient address");
        require(_owner != address(0), "Invalid owner address");
        require(_returnWallet != address(0), "Invalid return wallet");

        tokenOut = _tokenOut;
        amount = _amount;
        recipient = _recipient;
        owner = _owner;
        returnWallet = _returnWallet;
    }

    receive() external payable {}

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    function _safeTransfer(address token, address to, uint256 value) private {
        (bool success, bytes memory returnData) = token.call(
            abi.encodeWithSelector(TRANSFER_SELECTOR, to, value)
        );

        if (!success) revert TransferFailed();
        if (returnData.length > 0 && !abi.decode(returnData, (bool))) revert TransferFailed();
    }

    function execute() external onlyOwner {
        if (executed) revert AlreadyExecuted();

        executed = true;
        if (tokenOut == address(0)) {
            uint256 balance = address(this).balance;
            if (balance < amount) revert InsufficientBalance(balance, amount);

            (bool sentToRecipient,) = payable(recipient).call{value: amount}("");
            if (!sentToRecipient) revert NativeTransferFailed();

            emit Executed(tokenOut, amount, recipient);

            uint256 remainingNativeBalance = address(this).balance;
            if (remainingNativeBalance > 0) {
                (bool sentToReturnWallet,) = payable(returnWallet).call{value: remainingNativeBalance}("");
                if (!sentToReturnWallet) revert NativeTransferFailed();
                emit ExcessReturned(tokenOut, remainingNativeBalance, returnWallet);
            }
            return;
        }

        uint256 balance = IERC20Minimal(tokenOut).balanceOf(address(this));
        if (balance < amount) revert InsufficientBalance(balance, amount);
        _safeTransfer(tokenOut, recipient, amount);

        emit Executed(tokenOut, amount, recipient);

        uint256 remainingBalance = IERC20Minimal(tokenOut).balanceOf(address(this));
        if (remainingBalance > 0) {
            _safeTransfer(tokenOut, returnWallet, remainingBalance);
            emit ExcessReturned(tokenOut, remainingBalance, returnWallet);
        }
    }

    function rescueTokens(address token) external onlyOwner {
        uint256 balance = IERC20Minimal(token).balanceOf(address(this));
        require(balance > 0, "No tokens to rescue");

        _safeTransfer(token, returnWallet, balance);

        emit TokensRescued(token, balance, returnWallet);
    }

    function rescueNative() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No native balance to rescue");

        (bool sentToReturnWallet,) = payable(returnWallet).call{value: balance}("");
        if (!sentToReturnWallet) revert NativeTransferFailed();

        emit TokensRescued(address(0), balance, returnWallet);
    }

    function getConfig()
        external
        view
        returns (
            address _tokenOut,
            uint256 _amount,
            address _recipient,
            address _owner,
            address _returnWallet,
            bool _executed
        )
    {
        return (tokenOut, amount, recipient, owner, returnWallet, executed);
    }
}
